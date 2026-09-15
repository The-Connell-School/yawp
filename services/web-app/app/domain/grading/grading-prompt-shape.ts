import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  isBandScoredRubric,
  isCategoryFeedbackEnabled,
} from '~/domain/assignment-types/rubric-category-options';

/**
 * How much of a category the grading prompt needs. Kept structural so stored
 * categories, snapshot categories, and display categories can all be passed.
 */
export type GradingPromptCategory = Pick<
  RubricCategory,
  'key' | 'label' | 'weight' | 'description'
> &
  Partial<Pick<RubricCategory, 'scoreLabels' | 'bands' | 'feedbackEnabled'>>;

export type GradingPromptShape = {
  /** Whether the model is asked to comment on each category individually. */
  categoryFeedbackEnabled: boolean;
  /**
   * Whether every category declares bands, so scores are read on the scale the
   * bands are written in rather than converted from a coarser one.
   */
  bandScored: boolean;
  /** The full system prompt for the rubric evaluation pass. */
  systemPrompt: string;
  /** The rubric block dropped into the user prompt. */
  rubricText: string;
};

/**
 * Whether the model should be asked for per-category feedback at all.
 *
 * Every rubric asked for it before the setting existed, so a rubric where no
 * category opts out keeps asking. Only a rubric that turns feedback off for
 * every one of its categories drops to overall feedback alone.
 */
export function resolveCategoryFeedbackEnabled(
  categories: { key: string; feedbackEnabled?: boolean }[]
) {
  return categories.some((category) => isCategoryFeedbackEnabled(category));
}

/** The JSON shape the model is told to return. */
export function buildGradingResponseSchemaText({
  minScore,
  maxScore,
  categoryFeedbackEnabled,
  teacherNotesEnabled = false,
}: {
  minScore: number;
  maxScore: number;
  categoryFeedbackEnabled: boolean;
  teacherNotesEnabled?: boolean;
}) {
  const categoryFields = categoryFeedbackEnabled
    ? `{"key": string, "score": ${minScore}-${maxScore}, "comment": string}`
    : `{"key": string, "score": ${minScore}-${maxScore}}`;

  return `{\n  "categories": [${categoryFields}],\n  "overallComment": string${teacherNotesEnabled ? ',\n  "teacherNote": string | null' : ''}\n}`;
}

/**
 * The rubric block. Each category gets its usual key/label/weight/description
 * line, plus a line spelling out its configured words when it has them, so the
 * model scores against the words the teacher chose rather than bare numbers.
 */
export function buildGradingRubricText(categories: GradingPromptCategory[]) {
  return categories
    .map((category) => {
      const line = `${category.key}: ${category.label} (${Math.round(
        category.weight * 100
      )}%) - ${category.description}`;

      // Bands carry the words and what earns them, so a category that has them
      // needs nothing from the rubric's instruction text to be scored.
      if (category.bands?.length) {
        const bands = category.bands
          .slice()
          .sort((a, b) => b.min - a.min)
          .map(
            (band) =>
              `  ${band.min}-${band.max} ${band.label}${
                band.description ? `: ${band.description}` : ''
              }`
          )
          .join('\n');
        return `${line}\n${bands}`;
      }

      if (!category.scoreLabels?.length) return line;

      const meanings = category.scoreLabels
        .slice()
        .sort((a, b) => a.value - b.value)
        .map((entry) => `${entry.value} = ${entry.label}`)
        .join('; ');
      return `${line}\n  Score meanings: ${meanings}`;
    })
    .join('\n');
}

/**
 * Derives the grading prompt from the rubric itself, so a rubric that judges
 * one thing with overall feedback only produces a prompt that asks for exactly
 * that. Nothing here knows which assignment type it is grading.
 */
export function buildGradingPromptShape({
  categories,
  minScore,
  maxScore,
  studentFirstName,
  teacherNotesEnabled = false,
}: {
  categories: GradingPromptCategory[];
  minScore: number;
  maxScore: number;
  studentFirstName: string;
  teacherNotesEnabled?: boolean;
}): GradingPromptShape {
  const categoryFeedbackEnabled = resolveCategoryFeedbackEnabled(categories);
  const bandScored = isBandScoredRubric(categories);
  const schemaText = buildGradingResponseSchemaText({
    minScore,
    maxScore,
    categoryFeedbackEnabled,
    teacherNotesEnabled,
  });

  const feedbackRule = categoryFeedbackEnabled
    ? 'Provide concise, actionable comments.'
    : teacherNotesEnabled
      ? 'Do not write per-category feedback. Student-facing feedback belongs in overallComment; private observations belong only in teacherNote.'
      : 'Do not write per-category feedback. Every word of feedback belongs in overallComment.';

  const judgmentRule =
    categories.length === 1
      ? `Make one judgment: ${categories[0].label}. Judge it in depth.`
      : 'Return exactly one category for each rubric key provided.';

  // Picking the band first is what keeps a wide scale consistent: the band is
  // a judgment the rubric defines, and the score is only a position inside it.
  const scoringRule = bandScored
    ? `For each category, first decide which band the writing falls in from the band descriptions, then choose an integer inside that band's range. Do not score outside the band you chose.`
    : `Scores must be integers ${minScore}-${maxScore}.`;

  const systemPrompt = [
    `You are a grading assistant. Return ONLY valid JSON with the schema:\n${schemaText}`,
    scoringRule,
    judgmentRule,
    feedbackRule,
    ...(teacherNotesEnabled ? [
      'teacherNote is private to the teacher. Use only observations explicitly requested in the grading instructions; return null when there is no observation.',
      'Never put private observations in overallComment or category comments. Do not infer AI authorship, give an AI probability, or make an accusation. Do not reduce a score on suspicion.',
    ] : []),
    `In overallComment, start with "${studentFirstName}," and continue with cohesive feedback in a warm but professional tone.`,
    `After the name, continue naturally (for example: "${studentFirstName}, you ...").`,
    `Do not use fixed lead-ins like "Overall grade," or "${studentFirstName}, this is your overall feedback."`,
  ].join('\n');

  return {
    categoryFeedbackEnabled,
    bandScored,
    systemPrompt,
    rubricText: buildGradingRubricText(categories),
  };
}
