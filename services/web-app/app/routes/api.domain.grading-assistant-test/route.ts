import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import {
  buildResolvedAssignmentTypeGradingConfig,
  type AssignmentTypeGradingRow,
} from '~/domain/assignment-types/assignment-type-grading-config.server';
import { hasAssignmentTypeOwnedRubric } from '~/domain/assignment-types/assignment-type-rubric-config';
import { parseRubric } from '~/domain/assignment-types/assignment-type-rubric.shared';
import { runGradingAssistantScratchEvaluation } from '~/domain/ai-evaluation/grading-assistant-scratch-evaluation.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  parseGradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import crypto from 'node:crypto';
import { computeIpHash } from '~/utils/ai-usage-log.server';

const ScratchTestInputSchema = z.object({
  assignmentTypeId: z.string().min(1),
  title: z.string().min(1).max(200),
  scoringScaleJson: z.string().min(2),
  rubricJson: z.string().min(2),
  promptConfigJson: z.string().min(2),
  documentText: z.string().trim().min(1).max(50_000),
  criterion: z.string().trim().min(1).max(4_000),
  strictnessLevel: z.string().optional(),
});

function parseJson(value: string, fieldName: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Response(`${fieldName} must be valid JSON.`, { status: 400 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const parsedInput = ScratchTestInputSchema.safeParse(
    Object.fromEntries(formData)
  );
  if (!parsedInput.success) {
    return dataResponse(
      { success: false, message: 'Add a case document and criterion.' },
      { status: 400 }
    );
  }

  const input = parsedInput.data;
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
    },
  });
  if (!assignmentType) {
    throw new Response('Assignment type not found.', { status: 404 });
  }
  if (assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) {
    throw new Response(
      'AP History scratch tests require an assignment snapshot.',
      { status: 400 }
    );
  }

  const scoringScaleJson = parseJson(input.scoringScaleJson, 'Scoring scale');
  const rubricJson = parseJson(input.rubricJson, 'Rubric');
  const promptConfigJson = parseJson(
    input.promptConfigJson,
    'Prompt configuration'
  );
  if (!hasAssignmentTypeOwnedRubric(parseRubric(rubricJson))) {
    return dataResponse(
      {
        success: false,
        message: 'Add at least one complete rubric category before testing.',
      },
      { status: 400 }
    );
  }

  const draftRow: AssignmentTypeGradingRow = {
    ...assignmentType,
    title: input.title,
    scoringScaleJson,
    rubricJson,
    gradingPromptConfigJson: promptConfigJson,
  };
  const gradingConfig = buildResolvedAssignmentTypeGradingConfig({
    assignmentTypeId: assignmentType.id,
    assignmentTypeKind: assignmentType.kind,
    assignmentTypeTitle: input.title,
    row: draftRow,
  });
  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  const useE2EFixture = process.env.E2E === 'true';

  try {
    const result = await runGradingAssistantScratchEvaluation({
      gradingConfig,
      documentText: input.documentText,
      criterion: input.criterion,
      studentFirstName: 'Jordan',
      strictnessLevel:
        parseGradingAssistantStrictnessLevel(
          input.strictnessLevel ?? 'intermediate'
        ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
      execute: async ({ purpose, ...completion }) => {
        if (useE2EFixture) {
          if (purpose === 'criterion') {
            return JSON.stringify({
              passed: true,
              evidence:
                'The response identifies the thesis and gives a grounded next step.',
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
                ? 'scratch-grading-attempt'
                : 'scratch-criterion-evaluator',
            assignmentTypeId: assignmentType.id,
            gradingAssistantVersion: assignmentType.gradingAssistantVersion,
          },
          attribution: {
            organizationId: '',
            membershipId: '',
            route: 'routes/api.domain.grading-assistant-test',
            requestId: crypto.randomUUID(),
            ipHash: computeIpHash(request),
          },
        });
      },
    });

    return dataResponse({ success: true, result });
  } catch (error) {
    return dataResponse(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'The scratch evaluation could not run.',
      },
      { status: 500 }
    );
  }
}
