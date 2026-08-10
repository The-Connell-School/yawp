import { scoreToPercent } from './gradeMath';
import type { RubricDisplayCategory } from './rubric-display';

export type GradeBreakdownRow = {
  key: string;
  label: string;
  score: number;
  percent: number;
  /** The raw stored weight, whatever convention it was written in. */
  weight: number;
  /**
   * That weight as a share of the rubric's total, rounded.
   *
   * Weights are stored two ways: the built-in rubrics use fractions (0.25),
   * the assignment-type editor writes percents (25). The grade math divides by
   * the total either way, so only the share is meaningful to show — printing
   * the raw weight would read as "0.25%" for a quarter of the grade.
   */
  weightShare: number;
};

export type GradeBreakdown = {
  rows: GradeBreakdownRow[];
  weightedPercent: number;
  pointValue: number | null;
  earnedPoints: number | null;
};

/**
 * The arithmetic between a set of category scores and the number in the
 * gradebook, laid out step by step.
 *
 * This exists to be shown, not to grade: the overall percentage is still
 * computed by `computeWeightedPercentageForCategories`, and this reproduces
 * the same result so the panel can explain it. A teacher otherwise has to
 * infer that a 4 is 89% rather than 80%, and that points come off the
 * percentage rather than off the rubric.
 */
export function buildGradeBreakdown({
  rubricScores,
  categories,
  pointValue,
}: {
  rubricScores: Record<string, unknown> | null | undefined;
  categories: readonly RubricDisplayCategory[];
  /** Present for symmetry with the caller; the mapping is fixed at 1-5 today. */
  maxScore?: number;
  pointValue: number | null | undefined;
}): GradeBreakdown | null {
  if (!rubricScores || typeof rubricScores !== 'object') return null;
  if (categories.length === 0) return null;

  const rows: Omit<GradeBreakdownRow, 'weightShare'>[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const category of categories) {
    const entry = (rubricScores as Record<string, { score?: unknown }>)[
      category.key
    ];
    const score = entry?.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;

    const percent = scoreToPercent(score);
    if (percent === null) return null;

    rows.push({
      key: category.key,
      label: category.label,
      score,
      percent,
      weight: category.weight,
    });
    totalWeight += category.weight;
    weightedSum += percent * category.weight;
  }

  if (totalWeight <= 0) return null;

  const weightedPercent = Math.round(weightedSum / totalWeight);
  const hasPointValue =
    typeof pointValue === 'number' &&
    Number.isFinite(pointValue) &&
    pointValue > 0;

  return {
    rows: rows.map((row) => ({
      ...row,
      weightShare: Math.round((row.weight / totalWeight) * 100),
    })),
    weightedPercent,
    pointValue: hasPointValue ? pointValue : null,
    earnedPoints: hasPointValue
      ? Math.round((weightedPercent / 100) * pointValue)
      : null,
  };
}
