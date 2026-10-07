/* eslint-disable no-console */
/**
 * Creates Class Starter, Prewriting, and Thesis Statement assignment types for
 * the free classroom bundle. Does not link them to any existing organization —
 * free orgs receive them via provisioning only.
 *
 *   bun run --cwd packages/prisma seed-free-tier-bundle-assignment-types
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import {
  CLASS_STARTER_KIND,
  readClassStarterImage,
} from './seed-class-starter-assignment-type';
import { DEFAULT_OUTPUT_SCHEMA_JSON } from '../../../services/web-app/app/domain/assignment-types/assignment-type-rubric.shared';
import {
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/class-starter-rubric';
import {
  PREWRITING_PROMPT_CONFIG,
  PREWRITING_RUBRIC,
  PREWRITING_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/prewriting-assignment-type';
import {
  THESIS_STATEMENT_PROMPT_CONFIG,
  THESIS_STATEMENT_RUBRIC,
  THESIS_STATEMENT_SCORING_SCALE,
} from '../../../services/web-app/app/domain/assignment-types/thesis-statement-assignment-type';

const PREWRITING_KIND = 'prewriting';
const THESIS_STATEMENT_KIND = 'thesis_statement';

const fixturesDir = join(import.meta.dir, '../fixtures/prod-fidelity');
const modules = JSON.parse(
  readFileSync(join(fixturesDir, 'assignment-modules.json'), 'utf8')
) as Array<{
  id: string;
  title: string;
  position: number;
  description: string | null;
  tutorInstructions: string | null;
  rubricAlignmentJson: unknown;
}>;
const instructions = JSON.parse(
  readFileSync(join(fixturesDir, 'assignment-module-instructions.json'), 'utf8')
) as Array<{
  position: number;
  title: string;
  prompt: string;
  showChatButton: boolean | null;
  showNextButton: boolean | null;
  assignmentModuleId: string;
}>;

const PREWRITING_MODULE_ID = 'clxiepcvs0005h87l762r5xoh';
const THESIS_MODULE_ID = 'clxiepcvs0006h87l1cb28bwn';

function moduleFromProd(moduleId: string) {
  const mod = modules.find((row) => row.id === moduleId);
  if (!mod) throw new Error(`Missing fixture module ${moduleId}`);
  const steps = instructions
    .filter((row) => row.assignmentModuleId === moduleId)
    .sort((a, b) => a.position - b.position);
  return { mod, steps };
}

const CLASS_STARTER_MODULE = {
  title: 'Class Starter',
  position: 1,
  description: 'Short writing to start the period.',
  steps: [
    {
      title: 'Write',
      prompt: 'Write freely about the prompt for ten minutes.',
      position: 1,
      showChatButton: true,
    },
  ],
} as const;

const RUBRIC_DEFAULTS_BY_KIND: Record<
  string,
  {
    scoringScale: unknown;
    rubric: unknown;
    promptConfig: unknown;
    calibrationNotes: string;
  }
> = {
  [CLASS_STARTER_KIND]: {
    scoringScale: CLASS_STARTER_SCORING_SCALE,
    rubric: CLASS_STARTER_RUBRIC,
    promptConfig: CLASS_STARTER_PROMPT_CONFIG,
    calibrationNotes:
      'Class Starter judges engagement only — that the student wrote and reflected.',
  },
  [PREWRITING_KIND]: {
    scoringScale: PREWRITING_SCORING_SCALE,
    rubric: PREWRITING_RUBRIC,
    promptConfig: PREWRITING_PROMPT_CONFIG,
    calibrationNotes:
      'Standalone pre-writing: exploratory effort and movement toward a specific focus.',
  },
  [THESIS_STATEMENT_KIND]: {
    scoringScale: THESIS_STATEMENT_SCORING_SCALE,
    rubric: THESIS_STATEMENT_RUBRIC,
    promptConfig: THESIS_STATEMENT_PROMPT_CONFIG,
    calibrationNotes:
      'Standalone thesis statement: one arguable sentence with observation and analysis.',
  },
};

async function ensureAssignmentModules(
  prisma: PrismaClient,
  assignmentTypeId: string,
  payload: {
    title: string;
    position: number;
    description: string | null;
    tutorInstructions?: string | null;
    rubricAlignmentJson?: unknown;
    steps: Array<{
      position: number;
      title: string;
      prompt: string;
      showChatButton: boolean;
    }>;
  }
) {
  const existing = await prisma.assignmentModule.count({
    where: { assignmentTypeId },
  });
  if (existing > 0) return;
  await prisma.assignmentModule.create({
    data: {
      assignmentTypeId,
      title: payload.title,
      position: payload.position,
      description: payload.description,
      tutorInstructions: payload.tutorInstructions ?? null,
      rubricAlignmentJson: payload.rubricAlignmentJson ?? undefined,
      instructions: {
        create: payload.steps.map((step) => ({
          position: step.position,
          title: step.title,
          prompt: step.prompt,
          showChatButton: step.showChatButton,
        })),
      },
    },
  });
}

async function applyBundleRubricDefaults(
  prisma: PrismaClient,
  assignmentTypeId: string,
  kind: string
) {
  const defaults = RUBRIC_DEFAULTS_BY_KIND[kind];
  if (!defaults) return;
  await prisma.assignmentType.update({
    where: { id: assignmentTypeId },
    data: {
      scoringScaleJson: defaults.scoringScale as object,
      rubricJson: defaults.rubric as object,
      gradingPromptConfigJson: defaults.promptConfig as object,
      gradingOutputSchemaJson: DEFAULT_OUTPUT_SCHEMA_JSON as object,
      gradingCalibrationNotes: defaults.calibrationNotes,
    },
  });
}

async function ensureClassStarterImage(
  prisma: PrismaClient,
  assignmentTypeId: string
) {
  await prisma.assignmentTypeImage.upsert({
    where: { assignmentTypeId },
    create: {
      assignmentTypeId,
      ...readClassStarterImage(),
    },
    update: {},
  });
}

export async function assertFreeTierBundleAssignmentTypeParity(
  prisma: PrismaClient
) {
  const kinds = [CLASS_STARTER_KIND, PREWRITING_KIND, THESIS_STATEMENT_KIND];
  const types = await prisma.assignmentType.findMany({
    where: { kind: { in: kinds } },
    select: {
      id: true,
      kind: true,
      rubricJson: true,
      assignmentModules: { select: { id: true } },
    },
  });
  if (types.length !== kinds.length) {
    throw new Error('free_tier_bundle_types_missing');
  }
  for (const type of types) {
    if (!type.rubricJson || type.assignmentModules.length === 0) {
      throw new Error(`free_tier_bundle_type_incomplete:${type.kind}`);
    }
  }
}

function buildPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const isLocal = isLocalDatabaseUrl(connectionString);
  const adapter = new PrismaPg(
    { connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } }
  );
  return new PrismaClient({ adapter });
}

async function upsertStandaloneType(
  prisma: PrismaClient,
  args: {
    kind: string;
    title: string;
    description: string;
    position: number;
    moduleId: string;
  }
) {
  const { mod, steps } = moduleFromProd(args.moduleId);
  const assignmentType = await prisma.assignmentType.upsert({
    where: { kind: args.kind },
    update: {
      title: args.title,
      description: args.description,
      position: args.position,
      archivedAt: null,
    },
    create: {
      kind: args.kind,
      title: args.title,
      description: args.description,
      position: args.position,
      assignmentModules: {
        create: {
          title: mod.title,
          position: mod.position,
          description: mod.description,
          tutorInstructions: mod.tutorInstructions,
          rubricAlignmentJson: mod.rubricAlignmentJson ?? undefined,
          instructions: {
            create: steps.map((step) => ({
              position: step.position,
              title: step.title,
              prompt: step.prompt,
              showChatButton: step.showChatButton ?? false,
            })),
          },
        },
      },
    },
    select: { id: true, kind: true },
  });
  await ensureAssignmentModules(prisma, assignmentType.id, {
    title: mod.title,
    position: mod.position,
    description: mod.description,
    tutorInstructions: mod.tutorInstructions,
    rubricAlignmentJson: mod.rubricAlignmentJson,
    steps: steps.map((step) => ({
      position: step.position,
      title: step.title,
      prompt: step.prompt,
      showChatButton: step.showChatButton ?? false,
    })),
  });
  await applyBundleRubricDefaults(prisma, assignmentType.id, args.kind);
  return assignmentType;
}

export async function seedFreeTierBundleAssignmentTypes(prisma: PrismaClient) {
  const classStarter = await prisma.assignmentType.upsert({
    where: { kind: CLASS_STARTER_KIND },
    update: { archivedAt: null },
    create: {
      kind: CLASS_STARTER_KIND,
      title: 'Class Starter',
      description:
        'Open-ended writing to begin class. Graded on engagement: did the student write, and did they reflect.',
      position: 51,
      assignmentModules: {
        create: {
          title: 'Class Starter',
          position: 1,
          description: 'Short writing to start the period.',
          instructions: {
            create: {
              title: 'Write',
              prompt: 'Write freely about the prompt for ten minutes.',
              position: 1,
              showChatButton: true,
            },
          },
        },
      },
    },
    select: { id: true, kind: true },
  });
  await ensureAssignmentModules(prisma, classStarter.id, {
    title: CLASS_STARTER_MODULE.title,
    position: CLASS_STARTER_MODULE.position,
    description: CLASS_STARTER_MODULE.description,
    steps: [...CLASS_STARTER_MODULE.steps],
  });
  await applyBundleRubricDefaults(prisma, classStarter.id, CLASS_STARTER_KIND);
  await ensureClassStarterImage(prisma, classStarter.id);

  const prewriting = await upsertStandaloneType(prisma, {
    kind: PREWRITING_KIND,
    title: 'Prewriting',
    description:
      'Explore the prompt and find a specific focus before writing a thesis.',
    position: 52,
    moduleId: PREWRITING_MODULE_ID,
  });

  const thesis = await upsertStandaloneType(prisma, {
    kind: THESIS_STATEMENT_KIND,
    title: 'Thesis Statement',
    description: 'Develop a single clear, arguable thesis sentence.',
    position: 53,
    moduleId: THESIS_MODULE_ID,
  });

  await assertFreeTierBundleAssignmentTypeParity(prisma);

  return { classStarter, prewriting, thesis };
}

if (import.meta.main) {
  const prisma = buildPrismaClient();
  seedFreeTierBundleAssignmentTypes(prisma)
    .then((result) => {
      console.log('Free tier bundle assignment types ready:', result);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
