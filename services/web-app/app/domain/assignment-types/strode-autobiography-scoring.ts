/** Anchor percentages for Strode ENG 101 four-level category scores (levels 1–4). */
export const STRODE_AUTOBIOGRAPHY_ANCHORS = [55, 72, 85, 95] as const;

export const STRODE_AUTOBIOGRAPHY_PURE_SUMMARY_CAP = 64;
export const STRODE_AUTOBIOGRAPHY_VEER_SUMMARY_CAP = 74;

export const STRODE_AUTOBIOGRAPHY_CATEGORY_KEYS = [
  'plot',
  'character',
  'theme',
  'setting_scene_vs_summary',
  'open_form_tools',
] as const;

export type StrodeAutobiographyCategoryKey =
  (typeof STRODE_AUTOBIOGRAPHY_CATEGORY_KEYS)[number];

/** Tim Strode letter scale with +/- boundaries (85=B+, 75=C+, 65=D+). */
export function strodeEng101LetterFromPercent(percent: number): string {
  if (percent >= 90) return 'A';
  if (percent >= 85) return 'B+';
  if (percent >= 80) return 'B';
  if (percent >= 75) return 'C+';
  if (percent >= 70) return 'C';
  if (percent >= 65) return 'D+';
  if (percent >= 60) return 'D';
  return 'F';
}

function readCategoryAnchor(
  rubricScores: Record<string, unknown>,
  key: StrodeAutobiographyCategoryKey
): number | null {
  const value = rubricScores[key];
  if (!value || typeof value !== 'object') return null;
  const score = (value as { score?: unknown }).score;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

/** Mean of the five category anchors, rounded to the nearest whole number. */
export function computeStrodeAutobiographyMeanAnchor(
  rubricScores: Record<string, unknown>
): number | null {
  let sum = 0;
  for (const key of STRODE_AUTOBIOGRAPHY_CATEGORY_KEYS) {
    const anchor = readCategoryAnchor(rubricScores, key);
    if (anchor === null) return null;
    sum += anchor;
  }
  return Math.round(sum / STRODE_AUTOBIOGRAPHY_CATEGORY_KEYS.length);
}

/**
 * Summary caps from Tim's Project Two rubric (proxy via category anchor scores).
 * Plot or Setting at level 1 → top of D; veer/flat signals at level 2 → top of C.
 */
export function applyStrodeAutobiographySummaryCap(
  percent: number,
  rubricScores: Record<string, unknown>
): number {
  const plot = readCategoryAnchor(rubricScores, 'plot');
  const setting = readCategoryAnchor(rubricScores, 'setting_scene_vs_summary');
  const character = readCategoryAnchor(rubricScores, 'character');

  if (plot === 55 || setting === 55) {
    return Math.min(percent, STRODE_AUTOBIOGRAPHY_PURE_SUMMARY_CAP);
  }

  const veerOrFlat =
    plot === 72 ||
    setting === 72 ||
    character === 72 ||
    character === 55;

  if (veerOrFlat) {
    return Math.min(percent, STRODE_AUTOBIOGRAPHY_VEER_SUMMARY_CAP);
  }

  return percent;
}

export function computeStrodeAutobiographyFinalPercent(
  rubricScores: Record<string, unknown>
): number | null {
  const mean = computeStrodeAutobiographyMeanAnchor(rubricScores);
  if (mean === null) return null;
  return applyStrodeAutobiographySummaryCap(mean, rubricScores);
}
