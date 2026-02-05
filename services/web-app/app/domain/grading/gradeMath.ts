import { rubricCategories, type RubricKey } from './rubric';

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

type RubricScoreValue = {
  score: number;
  comment?: string;
  isAi?: boolean;
};

export function computeWeightedPercentage(
  rubricScores: Record<string, unknown> | null | undefined
) {
  if (!rubricScores || typeof rubricScores !== 'object') return null;

  const weights = rubricCategories.reduce<Record<RubricKey, number>>(
    (acc, cat) => {
      acc[cat.key] = cat.weight;
      return acc;
    },
    {} as Record<RubricKey, number>
  );

  let totalWeight = 0;
  let weightedSum = 0;

  for (const category of rubricCategories) {
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

