import {
  parseOptionalBoolean,
  parseRubricScoreLabels,
} from './rubric-category-options';

export const DEFAULT_OUTPUT_SCHEMA_JSON = {
  responseShape: 'categories_overall_comment',
  schemaVersion: 1,
} as const;

export type ScoringScaleData = {
  type: string;
  minScore: number;
  maxScore: number;
  compositeMin?: number;
  compositeMax?: number;
};

/** The word shown for one score value inside one rubric category. */
export type RubricScoreLabel = {
  value: number;
  label: string;
};

export type RubricCategory = {
  key: string;
  label: string;
  weight: number;
  description: string;
  /**
   * Per-category words for each score value. Absent means fall back to the
   * shared score labels, which is how every rubric behaved before this existed.
   */
  scoreLabels?: RubricScoreLabel[];
  /** Whether this category gets its own feedback textarea. Absent means yes. */
  feedbackEnabled?: boolean;
  /**
   * Whether this category produces grammar/syntax highlighting output. Absent
   * means fall back to the legacy grammar category keys.
   */
  grammarHighlighting?: boolean;
};

export type RubricData = {
  categories: RubricCategory[];
};

export type PromptConfigData = {
  gradingInstructions?: string;
  instructionsPreset?: string;
};

export const DEFAULT_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

export const DEFAULT_RUBRIC: RubricData = { categories: [] };

export const DEFAULT_PROMPT_CONFIG: PromptConfigData = { gradingInstructions: '' };

export function parseScoringScale(raw: unknown): ScoringScaleData {
  const d = raw as Partial<ScoringScaleData> | null;
  return {
    type: d?.type ?? 'weighted_1_5',
    minScore: d?.minScore ?? 1,
    maxScore: d?.maxScore ?? 5,
    compositeMin: d?.compositeMin,
    compositeMax: d?.compositeMax,
  };
}

export function parseRubric(raw: unknown): RubricData {
  const d = raw as Partial<RubricData> | null;
  const cats = Array.isArray(d?.categories) ? d!.categories : [];
  return {
    categories: cats.map((c: Partial<RubricCategory>) =>
      withRubricCategoryOptions(
        {
          key: c.key ?? '',
          label: c.label ?? '',
          weight: typeof c.weight === 'number' ? c.weight : 0,
          description: c.description ?? '',
        },
        c
      )
    ),
  };
}

/**
 * Copies the optional customizable options off a raw category onto a parsed
 * one, omitting each key entirely when it was absent or malformed. Shared by
 * every parser of this shape so a save or snapshot round trip cannot drop them.
 */
export function withRubricCategoryOptions<T extends { key: string }>(
  category: T,
  raw: unknown
): T {
  const source = (raw ?? {}) as Partial<RubricCategory>;
  const scoreLabels = parseRubricScoreLabels(source.scoreLabels);
  const feedbackEnabled = parseOptionalBoolean(source.feedbackEnabled);
  const grammarHighlighting = parseOptionalBoolean(source.grammarHighlighting);

  return {
    ...category,
    ...(scoreLabels ? { scoreLabels } : {}),
    ...(feedbackEnabled === undefined ? {} : { feedbackEnabled }),
    ...(grammarHighlighting === undefined ? {} : { grammarHighlighting }),
  };
}

export function parsePromptConfig(raw: unknown): PromptConfigData {
  const d = raw as
    | (Partial<PromptConfigData> & {
        systemInstructions?: string;
        scoreInstructions?: string;
        rubricInstructions?: string;
      })
    | null;

  if (typeof d?.gradingInstructions === 'string' && d.gradingInstructions.trim()) {
    return {
      gradingInstructions: d.gradingInstructions,
      instructionsPreset: d?.instructionsPreset ?? '',
    };
  }

  const legacyParts = [
    d?.systemInstructions,
    d?.scoreInstructions,
    d?.rubricInstructions,
  ].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );

  return {
    gradingInstructions: legacyParts.join('\n\n'),
    instructionsPreset: d?.instructionsPreset ?? '',
  };
}
