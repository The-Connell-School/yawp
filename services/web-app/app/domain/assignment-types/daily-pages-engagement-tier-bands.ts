export type DailyPagesEngagementTier =
  | 'not_present'
  | 'needs_more'
  | 'good'
  | 'excellent';

export type DailyPagesEngagementTierBand = {
  tier: DailyPagesEngagementTier;
  label: string;
  min: number;
  max: number;
};

/**
 * `round(percentage × total, halves up)` using integer math so values like
 * 0.7 × 45 land on 32, not 31 from floating-point error.
 */
export function percentOfTotalHalvesUp(total: number, percent: number): number {
  return Math.floor((total * percent + 50) / 100);
}

/**
 * Proportional engagement tiers for a teacher-set point total (≥ 5).
 * Excellent is always the full total only; Good tops out below 90% of total.
 */
export function dailyPagesEngagementTierBands(
  total: number
): DailyPagesEngagementTierBand[] {
  if (!Number.isSafeInteger(total) || total < 5) {
    throw new Error(
      `Daily Pages engagement totals must be a whole number ≥ 5 (received ${total}).`
    );
  }

  if (total === 5) {
    return [
      { tier: 'not_present', label: 'Not Present', min: 0, max: 2 },
      { tier: 'needs_more', label: 'Needs More', min: 3, max: 3 },
      { tier: 'good', label: 'Good', min: 4, max: 4 },
      { tier: 'excellent', label: 'Excellent', min: 5, max: 5 },
    ];
  }

  const needsMoreLow = percentOfTotalHalvesUp(total, 70);
  let goodLow = percentOfTotalHalvesUp(total, 80);
  let goodHigh = percentOfTotalHalvesUp(total, 90) - 1;
  if (goodHigh < goodLow) goodHigh = goodLow;
  let needsMoreHigh = goodLow - 1;
  if (needsMoreHigh < needsMoreLow) needsMoreHigh = needsMoreLow;

  let notPresentMax = needsMoreLow - 1;
  if (notPresentMax < 0) notPresentMax = 0;

  if (goodLow <= needsMoreHigh) {
    goodLow = needsMoreHigh + 1;
  }
  if (goodHigh < goodLow) goodHigh = goodLow;
  if (goodLow >= total) {
    goodLow = Math.max(needsMoreHigh + 1, total - 1);
    goodHigh = goodLow;
  }

  return [
    {
      tier: 'not_present',
      label: 'Not Present',
      min: 0,
      max: notPresentMax,
    },
    {
      tier: 'needs_more',
      label: 'Needs More',
      min: needsMoreLow,
      max: needsMoreHigh,
    },
    {
      tier: 'good',
      label: 'Good',
      min: goodLow,
      max: goodHigh,
    },
    {
      tier: 'excellent',
      label: 'Excellent',
      min: total,
      max: total,
    },
  ];
}

export function formatDailyPagesEngagementBandRange(
  band: DailyPagesEngagementTierBand
): string {
  if (band.min === band.max) return String(band.min);
  return `${band.min}–${band.max}`;
}

/** One picker value per tier for holistic manual grading (Excellent = full total). */
export function dailyPagesEngagementHolisticPickerScores(total: number): number[] {
  return dailyPagesEngagementTierBands(total).map((band) =>
    band.tier === 'excellent' ? band.max : band.min
  );
}
