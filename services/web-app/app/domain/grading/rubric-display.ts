import { rubricCategories } from './rubric';
import {
  getCategoryScoreLabel,
  parseOptionalBoolean,
  parseRubricScoreBands,
  parseRubricScoreLabels,
} from '~/domain/assignment-types/rubric-category-options';
import { getCategoryScoreBounds } from '~/domain/assignment-types/rubric-category-options';
import type {
  RubricScoreBand,
  RubricScoreLabel,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  buildScoreScaleValues,
  normalizeScoreStep,
} from '~/domain/assignment-types/score-scale-steps';

export type RubricDisplayCategory = {
  key: string;
  label: string;
  description: string;
  weight: number;
  scoreLabels?: RubricScoreLabel[];
  bands?: RubricScoreBand[];
  feedbackEnabled?: boolean;
  grammarHighlighting?: boolean;
};

export type RubricDisplaySource =
  'assignment-type' | 'thesis-default' | 'daily-pages-default';

export type RubricDisplayConfig = {
  categories: RubricDisplayCategory[];
  minScore: number;
  maxScore: number;
  /** Gap between allowed scores; absent or 1 means every value in the range. */
  step?: number;
  scoringType: string;
  /**
   * Which rubric actually produced this config: the assignment type's own
   * configured rubric, or the legacy thesis-driven-essay default it fell
   * back to because the assignment type has no fully-populated rubric.
   * Undefined for rubric configs that predate this distinction (legacy
   * snapshots, the hardcoded pre-assignment-type display fallback).
   */
  source?: RubricDisplaySource;
  /**
   * The assignment type owns this rubric but left some categories unfinished.
   * Surfaced to the teacher instead of quietly falling back to a default.
   */
  rubricIncomplete?: boolean;
};

const rubricDisplaySources = new Set<string>([
  'assignment-type',
  'thesis-default',
  'daily-pages-default',
]);

function parseRubricDisplaySource(
  value: unknown
): RubricDisplaySource | undefined {
  return typeof value === 'string' && rubricDisplaySources.has(value)
    ? (value as RubricDisplaySource)
    : undefined;
}

export type RubricScore = {
  score: number;
  comment: string;
  isAi?: boolean;
};

/**
 * A rubric score as it is stored.
 *
 * In the panel an unscored category holds the sentinel below the scale, which
 * only makes sense next to the scale it came from. What is written down says
 * "not scored" in a way every reader already understands: null.
 */
export type PersistedRubricScore = {
  score: number | null;
  comment: string;
  isAi?: boolean;
};

export const legacyRubricDisplayConfig: RubricDisplayConfig = {
  categories: rubricCategories.map((category) => ({
    key: category.key,
    label: category.label,
    description: category.description,
    weight: category.weight,
  })),
  minScore: 1,
  maxScore: 5,
  step: 1,
  scoringType: 'weighted_1_5',
};

const legacyScoreLabels: Record<number, string> = {
  1: 'Needs Improvement',
  2: 'Developing',
  3: 'Proficient',
  4: 'Strong',
  5: 'Exemplary',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function normalizeRubricDisplayConfig(
  raw: unknown
): RubricDisplayConfig {
  if (!isRecord(raw)) return legacyRubricDisplayConfig;

  const categories = Array.isArray(raw.categories)
    ? raw.categories
        .map((category) => {
          if (!isRecord(category)) return null;
          const key = typeof category.key === 'string' ? category.key : null;
          const label =
            typeof category.label === 'string' ? category.label : null;
          const description =
            typeof category.description === 'string'
              ? category.description
              : '';
          const weight =
            typeof category.weight === 'number' &&
            Number.isFinite(category.weight)
              ? category.weight
              : 0;
          if (!key || !label) return null;
          const scoreLabels = parseRubricScoreLabels(category.scoreLabels);
          const bands = parseRubricScoreBands(category.bands);
          const feedbackEnabled = parseOptionalBoolean(
            category.feedbackEnabled
          );
          const grammarHighlighting = parseOptionalBoolean(
            category.grammarHighlighting
          );
          return {
            key,
            label,
            description,
            weight,
            ...(scoreLabels ? { scoreLabels } : {}),
            ...(bands ? { bands } : {}),
            ...(feedbackEnabled === undefined ? {} : { feedbackEnabled }),
            ...(grammarHighlighting === undefined
              ? {}
              : { grammarHighlighting }),
          };
        })
        .filter(
          (category): category is RubricDisplayCategory => category !== null
        )
    : [];

  if (categories.length === 0) return legacyRubricDisplayConfig;

  const minScore =
    typeof raw.minScore === 'number' && Number.isFinite(raw.minScore)
      ? Math.round(raw.minScore)
      : legacyRubricDisplayConfig.minScore;
  const maxScore =
    typeof raw.maxScore === 'number' && Number.isFinite(raw.maxScore)
      ? Math.round(raw.maxScore)
      : legacyRubricDisplayConfig.maxScore;
  const step = normalizeScoreStep(
    typeof raw.step === 'number' ? raw.step : undefined
  );
  const scoringType =
    typeof raw.scoringType === 'string'
      ? raw.scoringType
      : legacyRubricDisplayConfig.scoringType;

  return {
    categories,
    minScore: Math.min(minScore, maxScore),
    maxScore: Math.max(minScore, maxScore),
    step,
    scoringType,
    source: parseRubricDisplaySource(raw.source),
    rubricIncomplete: raw.rubricIncomplete === true,
  };
}

/**
 * The score value that means "nobody has scored this yet".
 *
 * Every rubric used to start at 1, so 0 could stand in for unscored. A rubric
 * whose scale starts at 0 — where 0 is a real judgment, not a blank — needs the
 * sentinel to move out of the way, so it sits one step below the scale. On a
 * 1-5 scale that is still 0, exactly as it always was.
 */
export function unscoredValue(minScore: number) {
  return minScore - 1;
}

/** Whether this value is a real score on this scale rather than a blank. */
export function isScored(
  score: number | null | undefined,
  minScore: number
): score is number {
  return (
    typeof score === 'number' && Number.isFinite(score) && score >= minScore
  );
}

/**
 * The form of a rubric score map that is safe to write down.
 *
 * The sentinel is a panel-local convention: it is the scale's floor minus one,
 * so on a 0-3 scale it is -1, an integer no reader outside the panel would
 * recognise as "blank". Everything downstream — the reporter's class averages,
 * the student view — accepts any finite number as a real score. Persisting
 * unscored as null keeps an out-of-scale integer out of the database while
 * preserving a comment the teacher wrote before choosing a score.
 */
export function toPersistedRubricScores(
  scores: Record<string, RubricScore>,
  minScore: number
): Record<string, PersistedRubricScore> {
  return Object.entries(scores).reduce<Record<string, PersistedRubricScore>>(
    (acc, [key, value]) => {
      if (!value) return acc;
      acc[key] = {
        ...value,
        score: isScored(value.score, minScore) ? value.score : null,
      };
      return acc;
    },
    {}
  );
}

export function buildEmptyRubricScores(
  categories: RubricDisplayCategory[],
  minScore = 1
): Record<string, RubricScore> {
  const unscored = unscoredValue(minScore);
  return categories.reduce<Record<string, RubricScore>>((acc, item) => {
    acc[item.key] = { score: unscored, comment: '' };
    return acc;
  }, {});
}

export function normalizeRubricScoresForCategories({
  raw,
  categories,
  minScore,
  maxScore,
}: {
  raw: unknown;
  categories: RubricDisplayCategory[];
  minScore: number;
  maxScore: number;
}): Record<string, RubricScore> {
  const normalized = buildEmptyRubricScores(categories, minScore);
  const unscored = unscoredValue(minScore);
  if (!isRecord(raw)) return normalized;

  for (const item of categories) {
    const candidate = raw[item.key];
    // Early rubric payloads persisted the category value as a bare number.
    // Preserve that score when opening the modern grading form so saving an
    // unrelated field cannot normalize valid legacy scores to null.
    const scoreValue =
      typeof candidate === 'number'
        ? candidate
        : isRecord(candidate)
          ? candidate.score
          : undefined;
    const commentValue = isRecord(candidate) ? candidate.comment : undefined;

    const roundedScore =
      typeof scoreValue === 'number' && Number.isFinite(scoreValue)
        ? Math.round(scoreValue)
        : unscored;

    const categoryBounds = getCategoryScoreBounds(item);
    const categoryMin = categoryBounds?.min ?? minScore;
    const categoryMax = categoryBounds?.max ?? maxScore;
    normalized[item.key] = {
      score: isScored(roundedScore, minScore)
        ? Math.max(categoryMin, Math.min(categoryMax, roundedScore))
        : unscored,
      comment: typeof commentValue === 'string' ? commentValue : '',
      isAi: isRecord(candidate) && Boolean(candidate.isAi),
    };
  }

  return normalized;
}

/**
 * Builds the score dropdown options for one rubric category.
 *
 * `scoreLabels` are this category's own configured words. Any score value they
 * do not cover falls back to the shared 1-5 labels, which is exactly what every
 * rubric did before score labels became configurable.
 */
export function buildScoreOptions(
  minScore: number,
  maxScore: number,
  scoreLabels?: RubricScoreLabel[],
  step?: number,
  bands?: RubricScoreBand[]
) {
  // Same grid the rubric editor lays its label rows out on, so the teacher is
  // never offered a score the rubric has no label for.
  const categoryBounds = getCategoryScoreBounds({ key: '', bands });
  const optionMin = categoryBounds?.min ?? minScore;
  const optionMax = categoryBounds?.max ?? maxScore;
  return buildScoreScaleValues({
    minScore: optionMin,
    maxScore: optionMax,
    step,
  }).map((score) => {
    const configured = scoreLabels
      ? getCategoryScoreLabel({ scoreLabels }, score)
      : null;
    const suffix =
      configured ??
      (optionMax === 5 && optionMin === 1 ? legacyScoreLabels[score] : null);
    return {
      value: score.toString(),
      label: suffix ? `${score} - ${suffix}` : score.toString(),
    };
  });
}
