import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@app/prisma';
import type { ResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import {
  defaultGradingAssistantPromptTemplate,
  GRADING_ASSISTANT_PROMPT_VARIABLES,
  type GradingAssistantPromptTemplate,
} from '~/domain/grading/grading-assistant-invocation';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type EvaluationSuiteCaseSnapshot = {
  id: string;
  evaluationId: string | null;
  title: string;
  rubricCategoryKey: string;
  documentText: string;
  criterion: string;
  expectedOutputJson: unknown;
  position: number;
};

export type EvaluationSuiteSnapshot = {
  evaluations: Array<{
    id: string;
    title: string;
    description: string;
    position: number;
    cases: EvaluationSuiteCaseSnapshot[];
  }>;
  legacyCases: EvaluationSuiteCaseSnapshot[];
};

export const PROMPT_VERSION_VARIABLE_SCHEMA = {
  schemaVersion: 1,
  variables: GRADING_ASSISTANT_PROMPT_VARIABLES.map((name) => ({
    name,
    token: `{{${name}}}`,
  })),
};

export function isPromptVersionControlEnabled() {
  if (process.env.PROMPT_VERSION_CONTROL_ENABLED === 'false') return false;
  return (
    process.env.PROMPT_VERSION_CONTROL_ENABLED === 'true' ||
    process.env.E2E === 'true' ||
    process.env.NODE_ENV !== 'production'
  );
}

export function promptTemplateContentHash(
  template: GradingAssistantPromptTemplate
) {
  return createHash('sha256')
    .update(`${template.systemMessage}\u0000${template.userMessage}`)
    .digest('hex');
}

function suiteContentHash(snapshot: EvaluationSuiteSnapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function parseEvaluationSuiteSnapshot(
  value: unknown
): EvaluationSuiteSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as EvaluationSuiteSnapshot;
  if (!Array.isArray(snapshot.evaluations)) return null;
  return {
    evaluations: snapshot.evaluations,
    legacyCases: Array.isArray(snapshot.legacyCases)
      ? snapshot.legacyCases
      : [],
  };
}

export function flattenEvaluationSuiteCases(snapshot: EvaluationSuiteSnapshot) {
  return [
    ...snapshot.evaluations.flatMap((evaluation) => evaluation.cases),
    ...snapshot.legacyCases,
  ];
}

async function readCurrentEvaluationSuite(
  db: DbClient,
  assignmentTypeId: string
): Promise<EvaluationSuiteSnapshot> {
  const assignmentType = await db.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    select: {
      evaluations: {
        where: { archivedAt: null },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          cases: {
            where: { archivedAt: null },
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              evaluationId: true,
              title: true,
              rubricCategoryKey: true,
              documentText: true,
              criterion: true,
              expectedOutputJson: true,
              position: true,
            },
          },
        },
      },
      evaluationCases: {
        where: { archivedAt: null, evaluationId: null },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          evaluationId: true,
          title: true,
          rubricCategoryKey: true,
          documentText: true,
          criterion: true,
          expectedOutputJson: true,
          position: true,
        },
      },
    },
  });
  if (!assignmentType) throw new Error('Assignment type not found.');
  return {
    evaluations: assignmentType.evaluations,
    legacyCases: assignmentType.evaluationCases,
  };
}

export async function ensureEvaluationSuiteVersion(
  db: DbClient,
  assignmentTypeId: string
) {
  const latest = await db.assignmentTypeEvaluationSuiteVersion.findFirst({
    where: { assignmentTypeId },
    orderBy: { version: 'desc' },
  });
  if (latest) return latest;
  return createEvaluationSuiteVersion(db, assignmentTypeId);
}

export async function createEvaluationSuiteVersion(
  db: DbClient,
  assignmentTypeId: string
) {
  const [snapshot, latest] = await Promise.all([
    readCurrentEvaluationSuite(db, assignmentTypeId),
    db.assignmentTypeEvaluationSuiteVersion.findFirst({
      where: { assignmentTypeId },
      orderBy: { version: 'desc' },
    }),
  ]);
  const contentHash = suiteContentHash(snapshot);
  if (latest?.contentHash === contentHash) return latest;
  if (!latest) {
    return db.assignmentTypeEvaluationSuiteVersion.create({
      data: {
        assignmentTypeId,
        version: 1,
        contentHash,
        snapshotJson: inputJson(snapshot),
      },
    });
  }
  const existingRun =
    await db.assignmentTypeEvaluationRun.findFirst({
      where:
        latest.version === 1
          ? {
              assignmentTypeId,
              OR: [
                { evaluationSuiteVersionId: latest.id },
                { evaluationSuiteVersionId: null },
              ],
            }
          : { evaluationSuiteVersionId: latest.id },
      select: { id: true },
    });
  if (!existingRun) {
    return db.assignmentTypeEvaluationSuiteVersion.update({
      where: { id: latest.id },
      data: {
        contentHash,
        snapshotJson: inputJson(snapshot),
      },
    });
  }
  return db.assignmentTypeEvaluationSuiteVersion.create({
    data: {
      assignmentTypeId,
      version: latest.version + 1,
      contentHash,
      snapshotJson: inputJson(snapshot),
    },
  });
}

export async function ensureProductionPromptVersion({
  db,
  assignmentTypeId,
  gradingConfig,
}: {
  db: DbClient;
  assignmentTypeId: string;
  gradingConfig: ResolvedAssignmentTypeGradingConfig;
}) {
  const existing = await db.assignmentTypePromptVersion.findFirst({
    where: { assignmentTypeId, status: 'production' },
    orderBy: { version: 'desc' },
  });
  if (existing) return existing;
  const template = defaultGradingAssistantPromptTemplate(gradingConfig);
  return db.assignmentTypePromptVersion.create({
    data: {
      assignmentTypeId,
      version: Math.max(1, gradingConfig.version),
      revision: 1,
      status: 'production',
      systemMessageTemplate: template.systemMessage,
      userMessageTemplate: template.userMessage,
      variableSchemaJson: inputJson(PROMPT_VERSION_VARIABLE_SCHEMA),
      contentHash: promptTemplateContentHash(template),
      promotedAt: new Date(),
    },
  });
}

export function gradingConfigWithPromptVersion(
  gradingConfig: ResolvedAssignmentTypeGradingConfig,
  promptVersion: {
    version: number;
    systemMessageTemplate: string;
    userMessageTemplate: string;
  }
): ResolvedAssignmentTypeGradingConfig {
  return {
    ...gradingConfig,
    version: promptVersion.version,
    promptTemplate: {
      systemMessage: promptVersion.systemMessageTemplate,
      userMessage: promptVersion.userMessageTemplate,
    },
  };
}
