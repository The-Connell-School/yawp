import { computeWeightedBandPercentage } from '~/domain/grading/gradeMath';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';

export type HolisticTier = 'excellent' | 'good' | 'needs_more' | 'not_present';

export function holisticTierBandsForTotal(assignmentTotal: number) {
  const round = (n: number) => Math.round(n);
  const lowerExcellent = round(0.9 * assignmentTotal);
  const lowerGood = round(0.8 * assignmentTotal);
  const lowerNeedsMore = round(0.7 * assignmentTotal);
  return {
    excellent: { min: lowerExcellent, max: assignmentTotal },
    good: { min: lowerGood, max: lowerExcellent - 1 },
    needs_more: { min: lowerNeedsMore, max: lowerGood - 1 },
    not_present: { min: 0, max: lowerNeedsMore - 1 },
  } as const;
}

export function holisticTierForPercentage(percent: number): HolisticTier {
  if (percent >= 90) return 'excellent';
  if (percent >= 80) return 'good';
  if (percent >= 70) return 'needs_more';
  return 'not_present';
}

/**
 * When the model returns valid 1–4 (or band) category scores but omits
 * overallTier/overallPoints — common for Cristo Rey band rubrics whose GA text
 * says the runtime computes the weighted grade — derive the holistic tuple from
 * the weighted band percentage and assignment total.
 */
export function inferHolisticTupleFromCategoryScores({
  rubricScores,
  rubricCategories,
  assignmentTotal,
}: {
  rubricScores: Record<string, unknown>;
  rubricCategories: readonly Pick<RubricCategory, 'key' | 'weight' | 'bands'>[];
  assignmentTotal: number;
}): { overallTier: HolisticTier; overallPoints: number } | null {
  if (
    !Number.isFinite(assignmentTotal) ||
    assignmentTotal <= 0 ||
    rubricCategories.length === 0
  ) {
    return null;
  }

  const numericPercentage = computeWeightedBandPercentage(
    rubricScores,
    rubricCategories
  );
  if (numericPercentage === null) return null;

  const tier = holisticTierForPercentage(numericPercentage);
  const bands = holisticTierBandsForTotal(assignmentTotal);
  const band = bands[tier];
  const requestedPoints = Math.round(
    (numericPercentage / 100) * assignmentTotal
  );
  const overallPoints = Math.min(
    band.max,
    Math.max(band.min, requestedPoints)
  );

  return { overallTier: tier, overallPoints };
}
