import {
  parseOptionalBoolean,
  parseRubricScoreBands,
  parseRubricScoreLabels,
} from './rubric-category-options';
import { normalizeScoreStep } from './score-scale-steps';

export const DEFAULT_OUTPUT_SCHEMA_JSON = {
  responseShape: 'categories_overall_comment',
  schemaVersion: 1,
} as const;

export type ScoringScaleData = {
  type: string;
  minScore: number;
  maxScore: number;
  /**
   * The gap between one allowed score and the next: 0-30 by tens is four
   * tiers, not thirty-one. Absent means 1, which is how every scale behaved
   * before this existed, so no stored rubric changes meaning.
   */
  step?: number;
  compositeMin?: number;
  compositeMax?: number;
};

/** The word shown for one score value inside one rubric category. */
export type RubricScoreLabel = {
  value: number;
  label: string;
};

/**
 * One proficiency band inside one rubric category: a range of scores, the word
 * for it, and what earns it.
 *
 * A rubric that writes its bands out this way can be scored directly on the
 * scale the bands are written in, rather than judged on a coarse scale and
 * converted back afterwards. The band is what keeps that consistent: the model
 * picks a band from its description first, then a score inside it.
 */
export type RubricScoreBand = {
  min: number;
  max: number;
  label: string;
  description: string;
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
  /**
   * The proficiency bands this category is judged against. Present only on a
   * rubric that writes its bands out; absent keeps the older behaviour, where
   * band language lives in the rubric's instruction text instead.
   */
  bands?: RubricScoreBand[];
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
  systemInstructions?: string;
  gradingInstructions?: string;
  instructionsPreset?: string;
  systemMessageTemplate?: string;
  userMessageTemplate?: string;
};

export const DEFAULT_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

export const DEFAULT_RUBRIC: RubricData = { categories: [] };

export const DEFAULT_PROMPT_CONFIG: PromptConfigData = {
  systemInstructions: '',
  gradingInstructions: '',
};

export function rubricCategoryLabelToKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function prepareRubricForSave(rubric: RubricData): RubricData {
  return {
    categories: rubric.categories.map(
      ({ key, label, weight, description }) => ({
        key: key.trim() || rubricCategoryLabelToKey(label),
        label,
        weight,
        description,
      })
    ),
  };
}

export function parseScoringScale(raw: unknown): ScoringScaleData {
  const d = raw as Partial<ScoringScaleData> | null;
  return {
    type: d?.type ?? 'weighted_1_5',
    minScore: d?.minScore ?? 1,
    maxScore: d?.maxScore ?? 5,
    step: normalizeScoreStep(d?.step),
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
  const bands = parseRubricScoreBands(source.bands);
  const feedbackEnabled = parseOptionalBoolean(source.feedbackEnabled);
  const grammarHighlighting = parseOptionalBoolean(source.grammarHighlighting);

  return {
    ...category,
    ...(scoreLabels ? { scoreLabels } : {}),
    ...(bands ? { bands } : {}),
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

  const systemInstructions =
    typeof d?.systemInstructions === 'string' ? d.systemInstructions : '';
  const managedTemplates = {
    systemMessageTemplate:
      typeof d?.systemMessageTemplate === 'string'
        ? d.systemMessageTemplate
        : undefined,
    userMessageTemplate:
      typeof d?.userMessageTemplate === 'string'
        ? d.userMessageTemplate
        : undefined,
  };

  if (
    typeof d?.gradingInstructions === 'string' &&
    d.gradingInstructions.trim()
  ) {
    return {
      systemInstructions,
      gradingInstructions: d.gradingInstructions,
      instructionsPreset: d?.instructionsPreset ?? '',
      ...managedTemplates,
    };
  }

  const legacyParts = [d?.scoreInstructions, d?.rubricInstructions].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );

  return {
    systemInstructions,
    gradingInstructions: legacyParts.join('\n\n'),
    instructionsPreset: d?.instructionsPreset ?? '',
    ...managedTemplates,
  };
}
