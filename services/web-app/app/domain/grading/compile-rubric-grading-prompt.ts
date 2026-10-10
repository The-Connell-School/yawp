import { getAssignmentTypeGradingInstructions } from '~/domain/assignment-types/assignment-type-grading-config.server';
import type { RubricSchema } from '~/domain/rubrics/rubric-schema';
import { teacherNotesEnabled } from './teacher-notes';
import { buildGradingPromptShape } from './grading-prompt-shape';
import { buildGradingRequest } from './grading-request';
import {
  applyDisplayGrammarCategories,
  resolveDisplayOptions,
} from './rubric-display-options';

const GOLDEN_ESSAY = '<<< GOLDEN ESSAY PLACEHOLDER >>>';
const GOLDEN_STUDENT = 'Jordan';

export function compileRubricGradingPrompt(
  schema: RubricSchema,
  label = schema.title
) {
  const outputSchema = schema.outputSchema;
  const sourceCategories = schema.rubric.categories;
  const display = resolveDisplayOptions(outputSchema, sourceCategories, {});
  const categories = applyDisplayGrammarCategories(
    sourceCategories,
    outputSchema,
    {}
  );
  const { minScore, maxScore } = schema.scoringScale;
  const promptShape = buildGradingPromptShape({
    categories,
    minScore,
    maxScore,
    studentFirstName: GOLDEN_STUDENT,
    teacherNotesEnabled: teacherNotesEnabled(outputSchema, display),
    scoringMode: schema.scoringMode,
    assignmentPointTotal: null,
    display,
  });
  const request = buildGradingRequest({
    promptShape,
    instructions: getAssignmentTypeGradingInstructions(
      schema.promptConfig as Record<string, unknown>
    ),
    label,
    studentFirstName: GOLDEN_STUDENT,
    assignmentPrompt: null,
    essayText: GOLDEN_ESSAY,
  });
  const combined = `${request.system}\n---USER---\n${request.userPrompt}`;
  return { request, combined, display };
}
