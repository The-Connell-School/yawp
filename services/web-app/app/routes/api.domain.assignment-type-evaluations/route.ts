import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import type { Prisma } from '@app/prisma';
import { z } from 'zod';
import { buildResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { parseRubric } from '~/domain/assignment-types/assignment-type-rubric.shared';
import { runAssignmentTypeEvaluationSuite } from '~/domain/ai-evaluation/assignment-type-evaluation-suite.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { compileGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

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

const RunSuiteSchema = z.object({
  intent: z.literal('runSuite'),
  assignmentTypeId: z.string().min(1),
});

const ActionSchema = z.discriminatedUnion('intent', [
  GenerateEvaluationSchema,
  CreateEvaluationSchema,
  CreateCaseSchema,
  ArchiveCaseSchema,
  RunSuiteSchema,
]);

function errorResponse(message: string, status = 400) {
  return dataResponse({ success: false, message }, { status });
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

  const rubric = parseRubric(assignmentType.rubricJson);
  const rubricCategoryKeys = new Set(
    rubric.categories.map((category) => category.key)
  );

  if (input.intent === 'generateEvaluation') {
    if (rubric.categories.length === 0) {
      return errorResponse(
        'Add an assignment rubric before generating evaluation cases.'
      );
    }
    const gradingConfig = buildResolvedAssignmentTypeGradingConfig({
      assignmentTypeId: assignmentType.id,
      assignmentTypeKind: assignmentType.kind,
      assignmentTypeTitle: assignmentType.title,
      row: assignmentType,
    });
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
    const gradingConfig = buildResolvedAssignmentTypeGradingConfig({
      assignmentTypeId: assignmentType.id,
      assignmentTypeKind: assignmentType.kind,
      assignmentTypeTitle: assignmentType.title,
      row: assignmentType,
    });
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
    const evaluation = await prisma.assignmentTypeEvaluation.create({
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
    return dataResponse({ success: true, evaluationId: evaluation.id });
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
    const evaluationCase = await prisma.assignmentTypeEvaluationCase.create({
      data: {
        assignmentTypeId: assignmentType.id,
        rubricCategoryKey: input.rubricCategoryKey,
        title: input.title,
        documentText: input.documentText,
        criterion: input.criterion,
        position,
      },
    });
    return dataResponse({ success: true, caseId: evaluationCase.id });
  }

  if (input.intent === 'archiveCase') {
    const result = await prisma.assignmentTypeEvaluationCase.updateMany({
      where: {
        id: input.caseId,
        assignmentTypeId: assignmentType.id,
        archivedAt: null,
      },
      data: { archivedAt: new Date() },
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
  if (assignmentType.evaluationCases.length === 0) {
    return errorResponse('Add at least one evaluation case before running.');
  }

  const runningRun = await prisma.assignmentTypeEvaluationRun.findFirst({
    where: {
      assignmentTypeId: assignmentType.id,
      status: 'running',
    },
    select: { id: true },
  });
  if (runningRun) return errorResponse(RUN_IN_PROGRESS_MESSAGE, 409);

  const gradingConfig = buildResolvedAssignmentTypeGradingConfig({
    assignmentTypeId: assignmentType.id,
    assignmentTypeKind: assignmentType.kind,
    assignmentTypeTitle: assignmentType.title,
    row: assignmentType,
  });
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
        promptVersion: gradingConfig.version,
        status: 'running',
        totalCases: assignmentType.evaluationCases.length,
        promptSnapshotJson: inputJson({
          assignmentTypeTitle: assignmentType.title,
          version: gradingConfig.version,
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
      evaluationCases: assignmentType.evaluationCases,
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
        failedCases: assignmentType.evaluationCases.length,
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
