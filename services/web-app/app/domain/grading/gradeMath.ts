import { rubricCategories } from './rubric';
import type { RubricDisplayCategory } from './rubric-display';

export function scoreToPercent(score: number) {
  if (score === 5) return 100;
  if (score === 4) return 89;
  if (score === 3) return 79;
  if (score === 2) return 69;
  if (score === 1) return 59;
  return null;
}

export function letterFromPercent(percent: number) {
  if (percent >= 90) return 'A';
  if (percent >= 80) return 'B';
  if (percent >= 70) return 'C';
  if (percent >= 60) return 'D';
  return 'F';
}

export function formatGrade(percent: number | null, letter?: string | null) {
  if (percent === null || percent === undefined) return null;
  const resolvedLetter = letter ?? letterFromPercent(percent);
  return `${percent}% (${resolvedLetter})`;
}

export function formatPointGrade(
  percent: number | null | undefined,
  pointValue: number | null | undefined
) {
  if (percent === null || percent === undefined) return null;
  if (
    pointValue === null ||
    pointValue === undefined ||
    !Number.isFinite(pointValue) ||
    pointValue <= 0
  ) {
    return null;
  }

  const earned = Math.round((percent / 100) * pointValue);
  return `${earned} / ${pointValue}`;
}

export function formatAssignmentGrade({
  submitForGrade,
  numericPercentage,
  letterGrade,
  pointValue,
  score,
}: {
  submitForGrade: boolean | null | undefined;
  numericPercentage: number | null | undefined;
  letterGrade?: string | null;
  pointValue: number | null | undefined;
  score?: string | null;
}) {
  if (submitForGrade === false) return null;

  return (
    formatPointGrade(numericPercentage, pointValue) ||
    formatGrade(numericPercentage ?? null, letterGrade ?? null) ||
    score ||
    null
  );
}

/**
 * The scoring scale that reports raw points rather than a percentage.
 *
 * The 1-5 scales map each score to a percentage band, which only makes sense
 * when every score is passing. A scale whose floor is a zero — Daily Pages
 * engagement, where Absent is a real judgment — would turn a top score into a
 * C, so it reports earned points and leaves the percentage and letter alone.
 */
export const POINTS_SCALE_SCORING_TYPE = 'points_scale';

/**
 * The same scale under the name the admin editor and the rubric extractor
 * write. Daily Pages stores `points_scale`; anything configured through the
 * editor's "Rubric points" option stores `rubric_points`. Both mean raw
 * points, and a rubric that matched neither recorded no overall grade at all.
 */
export const RUBRIC_POINTS_SCORING_TYPE = 'rubric_points';

export function isPointsScaleScoringType(scoringType: string) {
  return (
    scoringType === POINTS_SCALE_SCORING_TYPE ||
    scoringType === RUBRIC_POINTS_SCORING_TYPE
  );
}

export function pointsScaleGradeFields({
  categories,
  maxScore,
}: {
  categories: Array<{ score: number }>;
  maxScore: number;
}) {
  const average =
    categories.reduce((sum, item) => sum + item.score, 0) / categories.length;
  const earned = Math.max(0, Math.min(maxScore, Math.round(average)));

  return {
    overallScore: earned,
    numericPercentage: null,
    letterGrade: null,
    score: `${earned}/${maxScore}`,
  };
}

type RubricScoreValue = {
  score: number;
  comment?: string;
  isAi?: boolean;
};

export function computeWeightedPercentage(
  rubricScores: Record<string, unknown> | null | undefined
) {
  return computeWeightedPercentageForCategories(rubricScores, rubricCategories);
}

export function computeWeightedPercentageForCategories(
  rubricScores: Record<string, unknown> | null | undefined,
  categories: readonly RubricDisplayCategory[]
) {
  if (!rubricScores || typeof rubricScores !== 'object') return null;

  const weights = categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.key] = cat.weight;
    return acc;
  }, {});

  let totalWeight = 0;
  let weightedSum = 0;

  for (const category of categories) {
    const value = (rubricScores as Record<string, RubricScoreValue>)[
      category.key
    ];
    const score = value?.score;
    if (!Number.isFinite(score) || score < 1 || score > 5) return null;
    const percent = scoreToPercent(score);
    if (percent === null) return null;
    totalWeight += weights[category.key];
    weightedSum += percent * weights[category.key];
  }

  if (totalWeight <= 0) return null;
  return Math.round(weightedSum / totalWeight);
}
