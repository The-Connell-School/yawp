import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@app/prisma';
import { z } from 'zod';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { parseRubric } from '~/domain/assignment-types/assignment-type-rubric.shared';
import { runAssignmentTypeEvaluationSuite } from '~/domain/ai-evaluation/assignment-type-evaluation-suite.server';
import {
  createEvaluationSuiteVersion,
  ensureEvaluationSuiteVersion,
  ensureProductionPromptVersion,
  flattenEvaluationSuiteCases,
  gradingConfigWithPromptVersion,
  parseEvaluationSuiteSnapshot,
  PROMPT_VERSION_VARIABLE_SCHEMA,
  promptTemplateContentHash,
} from '~/domain/ai-evaluation/prompt-version-control.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import {
  compileGradingAssistantInvocation,
  validateGradingAssistantPromptTemplate,
} from '~/domain/grading/grading-assistant-invocation';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import crypto from 'node:crypto';
import { computeIpHash } from '~/utils/ai-usage-log.server';

const GeneratedOutputSchema = z.object({
  categories: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(120),
        score: z.number().finite(),
        comment: z.string().trim().min(1).max(2_000),
      })
    )
    .min(1),
  overallComment: z.string().trim().min(1).max(4_000),
});

const GeneratedCasesSchema = z.object({
  evaluationTitle: z.string().trim().min(1).max(160),
  cases: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        documentText: z.string().trim().min(1).max(50_000),
        expectedOutput: GeneratedOutputSchema,
      })
    )
    .min(1)
    .max(8),
});

const GenerateEvaluationSchema = z.object({
  intent: z.literal('generateEvaluation'),
  assignmentTypeId: z.string().min(1),
  description: z.string().trim().min(1).max(4_000),
});

const CreateEvaluationSchema = z.object({
  intent: z.literal('createEvaluation'),
  assignmentTypeId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
  casesJson: z.string().min(1),
});

const UpdateEvaluationSchema = z.object({
  intent: z.literal('updateEvaluation'),
  assignmentTypeId: z.string().min(1),
  evaluationId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
  casesJson: z.string().min(1),
});

const CreateCaseSchema = z.object({
  intent: z.literal('createCase'),
  assignmentTypeId: z.string().min(1),
  rubricCategoryKey: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  documentText: z.string().trim().min(1).max(50_000),
  criterion: z.string().trim().min(1).max(4_000),
});

const ArchiveCaseSchema = z.object({
  intent: z.literal('archiveCase'),
  assignmentTypeId: z.string().min(1),
  caseId: z.string().min(1),
});

const CopyEvaluationSchema = z.object({
  intent: z.literal('copyEvaluation'),
  assignmentTypeId: z.string().min(1),
  sourceSuiteVersionId: z.string().min(1),
  sourceEvaluationId: z.string().min(1),
});

const CopyEvaluationSuiteSchema = z.object({
  intent: z.literal('copyEvaluationSuite'),
  assignmentTypeId: z.string().min(1),
  sourceSuiteVersionId: z.string().min(1),
});

const RunSuiteSchema = z.object({
  intent: z.literal('runSuite'),
  assignmentTypeId: z.string().min(1),
  promptVersionId: z.string().min(1).optional(),
  evaluationSuiteVersionId: z.string().min(1).optional(),
});

const CreatePromptDraftSchema = z.object({
  intent: z.literal('createPromptDraft'),
  assignmentTypeId: z.string().min(1),
  sourcePromptVersionId: z.string().min(1).optional(),
});

const UpdatePromptDraftSchema = z.object({
  intent: z.literal('updatePromptDraft'),
  assignmentTypeId: z.string().min(1),
  promptVersionId: z.string().min(1),
  systemMessageTemplate: z.string().trim().min(1).max(30_000),
  userMessageTemplate: z.string().trim().min(1).max(50_000),
});

const PromotePromptDraftSchema = z.object({
  intent: z.literal('promotePromptDraft'),
  assignmentTypeId: z.string().min(1),
  promptVersionId: z.string().min(1),
});

const ActionSchema = z.discriminatedUnion('intent', [
  GenerateEvaluationSchema,
  CreateEvaluationSchema,
  UpdateEvaluationSchema,
  CreateCaseSchema,
  ArchiveCaseSchema,
  CopyEvaluationSchema,
  CopyEvaluationSuiteSchema,
  CreatePromptDraftSchema,
  UpdatePromptDraftSchema,
  PromotePromptDraftSchema,
  RunSuiteSchema,
]);

function errorResponse(message: string, status = 400) {
  return dataResponse({ success: false, message }, { status });
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseCopyableExpectedOutput({
  value,
  rubricCategoryKeys,
  minScore,
  maxScore,
}: {
  value: unknown;
  rubricCategoryKeys: Set<string>;
  minScore: number;
  maxScore: number;
}) {
  const parsed = GeneratedOutputSchema.safeParse(value);
  if (!parsed.success) return null;
  const expectedKeys = [...rubricCategoryKeys].sort();
  const actualKeys = parsed.data.categories
    .map((category) => category.key)
    .sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    parsed.data.categories.some(
      (category) => category.score < minScore || category.score > maxScore
    )
  ) {
    return null;
  }
  return parsed.data;
}

const RUN_IN_PROGRESS_MESSAGE =
  'An evaluation suite run is already in progress.';

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const parsed = ActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return errorResponse('Complete every required evaluation field.');
  }

  const input = parsed.data;
  const assignmentType = await prisma.assignmentType.findUnique({
    where: { id: input.assignmentTypeId },
    select: {
      id: true,
      title: true,
      kind: true,
      systemKey: true,
      scoringScaleJson: true,
      rubricJson: true,
      gradingPromptConfigJson: true,
      gradingOutputSchemaJson: true,
      gradingCalibrationNotes: true,
      gradingAssistantVersion: true,
      gradingAssistantSourceTemplateId: true,
      gradingAssistantSourceTemplateSlug: true,
      evaluations: {
        where: { archivedAt: null },
        select: { id: true },
      },
      evaluationCases: {
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
        },
      },
    },
  });
  if (!assignmentType) return errorResponse('Assignment type not found.', 404);

  const resolvedGradingConfig = await resolveAssignmentTypeGradingConfig({
    assignmentTypeId: assignmentType.id,
    assignmentTypeKind: assignmentType.kind,
    assignmentTypeTitle: assignmentType.title,
  });
  const rubric = parseRubric(resolvedGradingConfig.rubricSnapshot);
  const rubricCategoryKeys = new Set(
    rubric.categories.map((category) => category.key)
  );

  if (input.intent === 'createPromptDraft') {
    const gradingConfig = resolvedGradingConfig;
    const production = await ensureProductionPromptVersion({
      db: prisma,
      assignmentTypeId: assignmentType.id,
      gradingConfig,
    });
    const source = input.sourcePromptVersionId
      ? await prisma.assignmentTypePromptVersion.findFirst({
          where: {
            id: input.sourcePromptVersionId,
            assignmentTypeId: assignmentType.id,
          },
        })
      : production;
    if (!source) return errorResponse('Prompt version not found.', 404);
    const latest = await prisma.assignmentTypePromptVersion.findFirst({
      where: { assignmentTypeId: assignmentType.id },
      orderBy: { version: 'desc' },
    });
    const draft = await prisma.assignmentTypePromptVersion.create({
      data: {
        assignmentTypeId: assignmentType.id,
        version: (latest?.version ?? 0) + 1,
        revision: 1,
        status: 'draft',
        systemMessageTemplate: source.systemMessageTemplate,
        userMessageTemplate: source.userMessageTemplate,
        variableSchemaJson: inputJson(PROMPT_VERSION_VARIABLE_SCHEMA),
        contentHash: promptTemplateContentHash({
          systemMessage: source.systemMessageTemplate,
          userMessage: source.userMessageTemplate,
        }),
      },
    });
    return dataResponse({
      success: true,
      promptVersionId: draft.id,
      version: draft.version,
    });
  }

  if (input.intent === 'updatePromptDraft') {
    const draft = await prisma.assignmentTypePromptVersion.findUnique({
      where: { id: input.promptVersionId },
    });
    if (
      !draft ||
      draft.assignmentTypeId !== assignmentType.id ||
      draft.status !== 'draft'
    ) {
      return errorResponse('Editable prompt draft not found.', 404);
    }
    const validationError = validateGradingAssistantPromptTemplate({
      systemMessage: input.systemMessageTemplate,
      userMessage: input.userMessageTemplate,
    });
    if (validationError) return errorResponse(validationError);
    const updated = await prisma.assignmentTypePromptVersion.update({
      where: { id: draft.id },
      data: {
        revision: { increment: 1 },
        systemMessageTemplate: input.systemMessageTemplate,
        userMessageTemplate: input.userMessageTemplate,
        variableSchemaJson: inputJson(PROMPT_VERSION_VARIABLE_SCHEMA),
        contentHash: promptTemplateContentHash({
          systemMessage: input.systemMessageTemplate,
          userMessage: input.userMessageTemplate,
        }),
      },
    });
    return dataResponse({
      success: true,
      promptVersionId: updated.id,
      revision: updated.revision,
    });
  }

  if (input.intent === 'promotePromptDraft') {
    const [draft, latestSuite] = await Promise.all([
      prisma.assignmentTypePromptVersion.findUnique({
        where: { id: input.promptVersionId },
      }),
      ensureEvaluationSuiteVersion(prisma, assignmentType.id),
    ]);
    if (
      !draft ||
      draft.assignmentTypeId !== assignmentType.id ||
      draft.status !== 'draft'
    ) {
      return errorResponse('Editable prompt draft not found.', 404);
    }
    const matchingRun = await prisma.assignmentTypeEvaluationRun.findFirst({
      where: {
        assignmentTypeId: assignmentType.id,
        promptVersionId: draft.id,
        promptRevision: draft.revision,
        evaluationSuiteVersionId: latestSuite.id,
        evaluationSuiteContentHash: latestSuite.contentHash,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, passedCases: true, totalCases: true },
    });
    if (!matchingRun) {
      return errorResponse(
        'Run the current draft against the latest evaluation suite before promoting.',
        409
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.assignmentTypePromptVersion.updateMany({
        where: {
          assignmentTypeId: assignmentType.id,
          status: 'production',
        },
        data: { status: 'previous' },
      });
      await tx.assignmentTypePromptVersion.update({
        where: { id: draft.id },
        data: { status: 'production', promotedAt: new Date() },
      });
      const previousConfig =
        assignmentType.gradingPromptConfigJson &&
        typeof assignmentType.gradingPromptConfigJson === 'object' &&
        !Array.isArray(assignmentType.gradingPromptConfigJson)
          ? assignmentType.gradingPromptConfigJson
          : {};
      await tx.assignmentType.update({
        where: { id: assignmentType.id },
        data: {
          gradingAssistantVersion: draft.version,
          gradingPromptConfigJson: inputJson({
            ...previousConfig,
            systemMessageTemplate: draft.systemMessageTemplate,
            userMessageTemplate: draft.userMessageTemplate,
          }),
        },
      });
    });
    return dataResponse({
      success: true,
      promptVersionId: draft.id,
      status: 'production',
      runId: matchingRun.id,
    });
  }

  if (input.intent === 'generateEvaluation') {
    if (rubric.categories.length === 0) {
      return errorResponse(
        'Add an assignment rubric before generating evaluation cases.'
      );
    }
    const gradingConfig = resolvedGradingConfig;
    const useE2EFixture = process.env.E2E === 'true';
    let rawGeneration: string;
    if (useE2EFixture) {
      const makeExpectedOutput = (overallComment: string) => ({
        categories: gradingConfig.rubricCategories.map((category) => ({
          key: category.key,
          score: Math.min(gradingConfig.maxScore, 4),
          comment: `${category.label} is addressed with document-grounded feedback.`,
        })),
        overallComment,
      });
      rawGeneration = JSON.stringify({
        evaluationTitle: 'Positive greeting',
        cases: [
          {
            title: 'Strong opening',
            documentText:
              'School uniforms should remain optional because student choice matters and schools can address distractions with narrower policies.',
            expectedOutput: makeExpectedOutput(
              'Jordan, you make a clear claim. Add a concrete example to show why student choice matters.'
            ),
          },
          {
            title: 'Missing opening',
            documentText:
              'There are many different opinions about school uniforms, and each school approaches the issue in a different way.',
            expectedOutput: makeExpectedOutput(
              'Jordan, you introduce the topic clearly. Add a specific position to guide the essay.'
            ),
          },
        ],
      });
    } else {
      rawGeneration = await getLLMCompletion({
        model: process.env.AI_MODEL ?? 'claude-sonnet-4-6',
        system:
          'You create synthetic grading-assistant evaluation cases. Return only JSON. Treat the requested behavior as the trusted evaluation requirement. Produce varied student-document inputs and a complete ideal grading-assistant JSON output for each one. The ideal output must use every rubric category exactly once and stay inside the scoring range. Never include real student data.',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              assignmentType: assignmentType.title,
              requestedBehavior: input.description,
              scoringRange: {
                min: gradingConfig.minScore,
                max: gradingConfig.maxScore,
              },
              rubric: gradingConfig.rubricCategories,
              responseShape: {
                evaluationTitle: 'Short behavior title',
                cases: [
                  {
                    title: 'Short example title',
                    documentText: 'Synthetic student submission',
                    expectedOutput: {
                      categories: [
                        {
                          key: 'rubric_category_key',
                          score: 1,
                          comment: 'Specific ideal category feedback',
                        },
                      ],
                      overallComment: 'Complete ideal final feedback',
                    },
                  },
                ],
              },
              requestedCaseCount: 5,
            }),
          },
        ],
        maxTokens: 5_000,
        temperature: 0.3,
        metadata: {
          feature: 'grading-evaluation-case-generation',
          assignmentTypeId: assignmentType.id,
        },
        attribution: {
          organizationId: '',
          membershipId: '',
          route: 'routes/api.domain.assignment-type-evaluations',
          requestId: crypto.randomUUID(),
          ipHash: computeIpHash(request),
        },
      });
    }

    let generated: z.infer<typeof GeneratedCasesSchema>;
    try {
      generated = GeneratedCasesSchema.parse(
        parseFirstJsonValue(rawGeneration)
      );
    } catch {
      return errorResponse(
        'The generated evaluation cases were incomplete. Try generating again.',
        502
      );
    }
    const expectedKeys = [...rubricCategoryKeys].sort();
    const hasInvalidOutput = generated.cases.some((evaluationCase) => {
      const actualKeys = evaluationCase.expectedOutput.categories
        .map((category) => category.key)
        .sort();
      return (
        actualKeys.length !== expectedKeys.length ||
        actualKeys.some((key, index) => key !== expectedKeys[index]) ||
        evaluationCase.expectedOutput.categories.some(
          (category) =>
            category.score < gradingConfig.minScore ||
            category.score > gradingConfig.maxScore
        )
      );
    });
    if (hasInvalidOutput) {
      return errorResponse(
        'The generated outputs did not match this assignment rubric. Try generating again.',
        502
      );
    }
    return dataResponse({
      success: true,
      evaluation: {
        title: generated.evaluationTitle,
        description: input.description,
        cases: generated.cases,
      },
    });
  }

  if (input.intent === 'createEvaluation') {
    let casesValue: unknown;
    try {
      casesValue = JSON.parse(input.casesJson);
    } catch {
      return errorResponse('Fix the expected output JSON before saving.');
    }
    const parsedCases = z
      .array(
        z.object({
          title: z.string().trim().min(1).max(160),
          documentText: z.string().trim().min(1).max(50_000),
          expectedOutput: GeneratedOutputSchema,
        })
      )
      .min(1)
      .max(8)
      .safeParse(casesValue);
    if (!parsedCases.success) {
      return errorResponse('Select at least one complete evaluation case.');
    }
    const firstRubricCategoryKey = rubric.categories[0]?.key;
    if (!firstRubricCategoryKey) {
      return errorResponse('Add an assignment rubric before saving cases.');
    }
    const gradingConfig = resolvedGradingConfig;
    const expectedKeys = [...rubricCategoryKeys].sort();
    const hasInvalidOutput = parsedCases.data.some((evaluationCase) => {
      const actualKeys = evaluationCase.expectedOutput.categories
        .map((category) => category.key)
        .sort();
      return (
        actualKeys.length !== expectedKeys.length ||
        actualKeys.some((key, index) => key !== expectedKeys[index]) ||
        evaluationCase.expectedOutput.categories.some(
          (category) =>
            category.score < gradingConfig.minScore ||
            category.score > gradingConfig.maxScore
        )
      );
    });
    if (hasInvalidOutput) {
      return errorResponse(
        'Every expected output must include this assignment’s full rubric and valid scores.'
      );
    }
    const position = await prisma.assignmentTypeEvaluation.count({
      where: { assignmentTypeId: assignmentType.id, archivedAt: null },
    });
    const evaluation = await prisma.$transaction(async (tx) => {
      const created = await tx.assignmentTypeEvaluation.create({
        data: {
          assignmentTypeId: assignmentType.id,
          title: input.title,
          description: input.description,
          position,
          cases: {
            create: parsedCases.data.map((evaluationCase, casePosition) => ({
              assignmentTypeId: assignmentType.id,
              title: evaluationCase.title,
              documentText: evaluationCase.documentText,
              expectedOutputJson: evaluationCase.expectedOutput,
              criterion:
                process.env.E2E === 'true' &&
                evaluationCase.title === 'Missing opening'
                  ? `${input.description} [fixture:improves-after-v1]`
                  : input.description,
              rubricCategoryKey: firstRubricCategoryKey,
              position: casePosition,
            })),
          },
        },
      });
      await createEvaluationSuiteVersion(tx, assignmentType.id);
      return created;
    });
    return dataResponse({ success: true, evaluationId: evaluation.id });
  }

  if (input.intent === 'updateEvaluation') {
    if (
      !assignmentType.evaluations.some(
        (evaluation) => evaluation.id === input.evaluationId
      )
    ) {
      return errorResponse('Evaluation not found.', 404);
    }
    let casesValue: unknown;
    try {
      casesValue = JSON.parse(input.casesJson);
    } catch {
      return errorResponse('Fix the expected output JSON before saving.');
    }
    const parsedCases = z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().trim().min(1).max(160),
          documentText: z.string().trim().min(1).max(50_000),
          expectedOutput: GeneratedOutputSchema,
        })
      )
      .min(1)
      .max(20)
      .safeParse(casesValue);
    if (!parsedCases.success) {
      return errorResponse('Every case needs a name, input, and full output.');
    }
    const activeEvaluationCases = assignmentType.evaluationCases.filter(
      (evaluationCase) => evaluationCase.evaluationId === input.evaluationId
    );
    const activeCaseIds = new Set(
      activeEvaluationCases.map((evaluationCase) => evaluationCase.id)
    );
    if (
      parsedCases.data.length !== activeEvaluationCases.length ||
      parsedCases.data.some(
        (evaluationCase) => !activeCaseIds.has(evaluationCase.id)
      )
    ) {
      return errorResponse(
        'The saved cases changed while you were editing. Reopen the evaluation and try again.',
        409
      );
    }
    const gradingConfig = resolvedGradingConfig;
    const expectedKeys = [...rubricCategoryKeys].sort();
    const hasInvalidOutput = parsedCases.data.some((evaluationCase) => {
      const actualKeys = evaluationCase.expectedOutput.categories
        .map((category) => category.key)
        .sort();
      return (
        actualKeys.length !== expectedKeys.length ||
        actualKeys.some((key, index) => key !== expectedKeys[index]) ||
        evaluationCase.expectedOutput.categories.some(
          (category) =>
            category.score < gradingConfig.minScore ||
            category.score > gradingConfig.maxScore
        )
      );
    });
    if (hasInvalidOutput) {
      return errorResponse(
        'Every expected output must include this assignment’s full rubric and valid scores.'
      );
    }

    await prisma.$transaction(async (tx) => {
      const updatedEvaluation = await tx.assignmentTypeEvaluation.updateMany({
        where: {
          id: input.evaluationId,
          assignmentTypeId: assignmentType.id,
          archivedAt: null,
        },
        data: {
          title: input.title,
          description: input.description,
        },
      });
      if (updatedEvaluation.count === 0) {
        throw new Error('Evaluation not found.');
      }
      for (const evaluationCase of parsedCases.data) {
        const existingCase = activeEvaluationCases.find(
          (activeCase) => activeCase.id === evaluationCase.id
        );
        const fixtureSuffix =
          process.env.E2E === 'true' &&
          existingCase?.criterion.includes('[fixture:improves-after-v1]')
            ? ' [fixture:improves-after-v1]'
            : '';
        const updatedCase = await tx.assignmentTypeEvaluationCase.updateMany({
          where: {
            id: evaluationCase.id,
            evaluationId: input.evaluationId,
            assignmentTypeId: assignmentType.id,
            archivedAt: null,
          },
          data: {
            title: evaluationCase.title,
            documentText: evaluationCase.documentText,
            expectedOutputJson: inputJson(evaluationCase.expectedOutput),
            criterion: `${input.description}${fixtureSuffix}`,
          },
        });
        if (updatedCase.count === 0) {
          throw new Error('Evaluation case not found.');
        }
      }
      await createEvaluationSuiteVersion(tx, assignmentType.id);
    });
    return dataResponse({ success: true });
  }

  if (
    input.intent === 'copyEvaluation' ||
    input.intent === 'copyEvaluationSuite'
  ) {
    const sourceSuite =
      await prisma.assignmentTypeEvaluationSuiteVersion.findUnique({
        where: { id: input.sourceSuiteVersionId },
        select: {
          id: true,
          assignmentTypeId: true,
          snapshotJson: true,
        },
      });
    const sourceSnapshot = sourceSuite
      ? parseEvaluationSuiteSnapshot(sourceSuite.snapshotJson)
      : null;
    if (!sourceSuite || !sourceSnapshot) {
      return errorResponse('Source evaluation suite not found.', 404);
    }
    const sourceEvaluations =
      input.intent === 'copyEvaluation'
        ? sourceSnapshot.evaluations.filter(
            (evaluation) => evaluation.id === input.sourceEvaluationId
          )
        : sourceSnapshot.evaluations;
    if (sourceEvaluations.length === 0) {
      return errorResponse('Source evaluation not found.', 404);
    }
    const gradingConfig = resolvedGradingConfig;
    const copiedEvaluations = sourceEvaluations.map((evaluation) => ({
      ...evaluation,
      cases: evaluation.cases.map((evaluationCase) => ({
        ...evaluationCase,
        expectedOutput: parseCopyableExpectedOutput({
          value: evaluationCase.expectedOutputJson,
          rubricCategoryKeys,
          minScore: gradingConfig.minScore,
          maxScore: gradingConfig.maxScore,
        }),
      })),
    }));
    if (
      copiedEvaluations.some(
        (evaluation) =>
          evaluation.cases.length === 0 ||
          evaluation.cases.some(
            (evaluationCase) => !evaluationCase.expectedOutput
          )
      )
    ) {
      return errorResponse(
        'That evaluation suite uses a different rubric or scoring range.'
      );
    }
    const firstRubricCategoryKey = rubric.categories[0]?.key;
    if (!firstRubricCategoryKey) {
      return errorResponse('Add an assignment rubric before copying cases.');
    }
    const startingPosition = await prisma.assignmentTypeEvaluation.count({
      where: { assignmentTypeId: assignmentType.id, archivedAt: null },
    });
    const createdEvaluationIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const [index, evaluation] of copiedEvaluations.entries()) {
        const created = await tx.assignmentTypeEvaluation.create({
          data: {
            assignmentTypeId: assignmentType.id,
            title: evaluation.title,
            description: evaluation.description,
            position: startingPosition + index,
            cases: {
              create: evaluation.cases.map(
                (evaluationCase, casePosition) => ({
                  assignmentTypeId: assignmentType.id,
                  title: evaluationCase.title,
                  documentText: evaluationCase.documentText,
                  expectedOutputJson: inputJson(
                    evaluationCase.expectedOutput
                  ),
                  criterion: evaluationCase.criterion,
                  rubricCategoryKey: rubricCategoryKeys.has(
                    evaluationCase.rubricCategoryKey
                  )
                    ? evaluationCase.rubricCategoryKey
                    : firstRubricCategoryKey,
                  position: casePosition,
                })
              ),
            },
          },
        });
        createdEvaluationIds.push(created.id);
      }
      await createEvaluationSuiteVersion(tx, assignmentType.id);
    });
    return dataResponse({
      success: true,
      ...(input.intent === 'copyEvaluation'
        ? { evaluationId: createdEvaluationIds[0] }
        : {}),
      copiedEvaluations: createdEvaluationIds.length,
    });
  }

  if (input.intent === 'createCase') {
    if (!rubricCategoryKeys.has(input.rubricCategoryKey)) {
      return errorResponse('Choose a category from this assignment rubric.');
    }
    const position = await prisma.assignmentTypeEvaluationCase.count({
      where: {
        assignmentTypeId: assignmentType.id,
        archivedAt: null,
      },
    });
    const evaluationCase = await prisma.$transaction(async (tx) => {
      const created = await tx.assignmentTypeEvaluationCase.create({
        data: {
          assignmentTypeId: assignmentType.id,
          rubricCategoryKey: input.rubricCategoryKey,
          title: input.title,
          documentText: input.documentText,
          criterion: input.criterion,
          position,
        },
      });
      await createEvaluationSuiteVersion(tx, assignmentType.id);
      return created;
    });
    return dataResponse({ success: true, caseId: evaluationCase.id });
  }

  if (input.intent === 'archiveCase') {
    const result = await prisma.$transaction(async (tx) => {
      const archived = await tx.assignmentTypeEvaluationCase.updateMany({
        where: {
          id: input.caseId,
          assignmentTypeId: assignmentType.id,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      if (archived.count > 0) {
        await createEvaluationSuiteVersion(tx, assignmentType.id);
      }
      return archived;
    });
    if (result.count === 0)
      return errorResponse('Evaluation case not found.', 404);
    return dataResponse({ success: true });
  }

  if (assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
    return errorResponse(
      'AP History suite runs require an assignment snapshot.'
    );
  }
  const runningRun = await prisma.assignmentTypeEvaluationRun.findFirst({
    where: {
      assignmentTypeId: assignmentType.id,
      status: 'running',
    },
    select: { id: true },
  });
  if (runningRun) return errorResponse(RUN_IN_PROGRESS_MESSAGE, 409);

  const baseGradingConfig = resolvedGradingConfig;
  const [promptVersion, evaluationSuiteVersion] = await Promise.all([
    input.promptVersionId
      ? prisma.assignmentTypePromptVersion.findUnique({
          where: { id: input.promptVersionId },
        })
      : ensureProductionPromptVersion({
          db: prisma,
          assignmentTypeId: assignmentType.id,
          gradingConfig: baseGradingConfig,
        }),
    input.evaluationSuiteVersionId
      ? prisma.assignmentTypeEvaluationSuiteVersion.findUnique({
          where: { id: input.evaluationSuiteVersionId },
        })
      : ensureEvaluationSuiteVersion(prisma, assignmentType.id),
  ]);
  if (
    !promptVersion ||
    promptVersion.assignmentTypeId !== assignmentType.id
  ) {
    return errorResponse('Prompt version not found.', 404);
  }
  if (
    !evaluationSuiteVersion ||
    evaluationSuiteVersion.assignmentTypeId !== assignmentType.id
  ) {
    return errorResponse('Evaluation suite version not found.', 404);
  }
  const evaluationSnapshot = parseEvaluationSuiteSnapshot(
    evaluationSuiteVersion.snapshotJson
  );
  if (!evaluationSnapshot) {
    return errorResponse('The evaluation suite snapshot is invalid.', 409);
  }
  const evaluationCases = flattenEvaluationSuiteCases(evaluationSnapshot);
  if (evaluationCases.length === 0) {
    return errorResponse('Add at least one evaluation case before running.');
  }
  const gradingConfig = gradingConfigWithPromptVersion(
    baseGradingConfig,
    promptVersion
  );
  const compiledPrompt = compileGradingAssistantInvocation({
    gradingConfig,
    studentFirstName: 'Jordan',
    strictnessLevel: 'intermediate',
    documentText: '[CASE DOCUMENT CONTENT]',
  });
  let run: { id: string };
  try {
    run = await prisma.assignmentTypeEvaluationRun.create({
      data: {
        assignmentTypeId: assignmentType.id,
        promptVersion: promptVersion.version,
        promptVersionId: promptVersion.id,
        promptRevision: promptVersion.revision,
        evaluationSuiteVersionId: evaluationSuiteVersion.id,
        evaluationSuiteContentHash: evaluationSuiteVersion.contentHash,
        evaluationSnapshotJson: inputJson(evaluationSnapshot),
        status: 'running',
        totalCases: evaluationCases.length,
        promptSnapshotJson: inputJson({
          assignmentTypeTitle: assignmentType.title,
          version: promptVersion.version,
          revision: promptVersion.revision,
          status: promptVersion.status,
          contentHash: promptVersion.contentHash,
          template: {
            systemMessage: promptVersion.systemMessageTemplate,
            userMessage: promptVersion.userMessageTemplate,
          },
          scoringScale: {
            type: gradingConfig.scoringType,
            minScore: gradingConfig.minScore,
            maxScore: gradingConfig.maxScore,
          },
          rubric: gradingConfig.rubricSnapshot,
          promptConfig: gradingConfig.promptConfigSnapshot,
          compiledPrompt,
        }),
      },
    });
  } catch (error) {
    // The database's partial unique index closes the race between the check
    // above and creating the run. Re-check so that race has a useful response.
    const conflictingRun = await prisma.assignmentTypeEvaluationRun.findFirst({
      where: {
        assignmentTypeId: assignmentType.id,
        status: 'running',
      },
      select: { id: true },
    });
    if (conflictingRun) return errorResponse(RUN_IN_PROGRESS_MESSAGE, 409);
    throw error;
  }

  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  const useE2EFixture = process.env.E2E === 'true';

  try {
    const suiteResult = await runAssignmentTypeEvaluationSuite({
      gradingConfig,
      evaluationCases,
      execute: async ({ evaluationCase, purpose, ...completion }) => {
        if (useE2EFixture) {
          if (purpose === 'criterion') {
            const improvesAfterVersionOne = evaluationCase.criterion.includes(
              '[fixture:improves-after-v1]'
            );
            const passed =
              !improvesAfterVersionOne || gradingConfig.version > 1;
            return JSON.stringify({
              passed,
              evidence: passed
                ? 'The output satisfies the saved evaluation criterion.'
                : 'The first prompt version misses the saved evaluation criterion.',
            });
          }
          return JSON.stringify({
            categories: gradingConfig.rubricCategories.map((category) => ({
              key: category.key,
              score: Math.min(
                gradingConfig.maxScore,
                Math.max(gradingConfig.minScore, 4)
              ),
              comment: `${category.label} is grounded in the case document.`,
            })),
            overallComment: 'Jordan, make the stakes more explicit.',
          });
        }

        return getLLMCompletion({
          model,
          ...completion,
          metadata: {
            feature: 'grading-evaluation',
            kind:
              purpose === 'grading'
                ? 'suite-grading-attempt'
                : 'suite-criterion-evaluator',
            assignmentTypeId: assignmentType.id,
            evaluationCaseId: evaluationCase.id,
            evaluationRunId: run.id,
            gradingAssistantVersion: gradingConfig.version,
          },
          attribution: {
            organizationId: '',
            membershipId: '',
            route: 'routes/api.domain.assignment-type-evaluations',
            requestId: crypto.randomUUID(),
            ipHash: computeIpHash(request),
          },
        });
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.assignmentTypeEvaluationResult.createMany({
        data: suiteResult.results.map((result) => ({
          runId: run.id,
          caseId: result.caseId,
          caseTitle: result.caseTitle,
          rubricCategoryKey: result.rubricCategoryKey,
          criterion: result.criterion,
          status: result.status,
          evidence: result.evidence,
          ...(result.gradingOutput
            ? { gradingOutputJson: inputJson(result.gradingOutput) }
            : {}),
          ...(result.expectedOutput
            ? { expectedOutputJson: inputJson(result.expectedOutput) }
            : {}),
          responseContractJson: inputJson(result.responseContract),
          ...(result.requestSnapshot
            ? { requestSnapshotJson: inputJson(result.requestSnapshot) }
            : {}),
        })),
      });
      await tx.assignmentTypeEvaluationRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          passedCases: suiteResult.summary.passed,
          failedCases: suiteResult.summary.failed,
          needsReviewCases: suiteResult.summary.needsReview,
          completedAt: new Date(),
        },
      });
    });

    return dataResponse({
      success: true,
      runId: run.id,
      summary: suiteResult.summary,
    });
  } catch (error) {
    await prisma.assignmentTypeEvaluationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        failedCases: evaluationCases.length,
        completedAt: new Date(),
      },
    });
    return errorResponse(
      error instanceof Error
        ? error.message
        : 'The evaluation suite could not run.',
      500
    );
  }
}
