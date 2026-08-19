import {
  DEFAULT_INSIGHT_RUBRIC,
  isHighScore,
  isLowScore,
  scoreFraction,
  type InsightRubric,
  type InsightRubricCategory,
} from './insight-rubric';

/** How many example comments to retain per category for LLM synthesis. */
const SAMPLE_COMMENT_CAP = 5;

export type SubmissionRubricScore = {
  score?: unknown;
  comment?: unknown;
  isAi?: unknown;
};

/** A category entry is either a bare score (legacy) or a scored object. */
export type SubmissionRubricEntry = SubmissionRubricScore | number;

export type GradedSubmissionInput = {
  submissionId: string;
  studentName?: string | null;
  rubricScores?: Record<string, SubmissionRubricEntry> | null;
  overallComment?: string | null;
};

export type ScoreBand = 1 | 2 | 3 | 4 | 5;

export type CategoryAggregate = {
  key: string;
  label: string;
  weight: number;
  /** Mean score across submissions that scored this category; null when none did. */
  averageScore: number | null;
  scoredCount: number;
  distribution: Record<ScoreBand, number>;
  lowCount: number;
  highCount: number;
  sampleComments: string[];
};

export type ClassRubricAggregate = {
  submissionCount: number;
  categories: CategoryAggregate[];
  strongest: string | null;
  weakest: string | null;
};

function emptyDistribution(): Record<ScoreBand, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function toFiniteScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Read the numeric score for a single rubric entry, supporting both the legacy
 * flat shape (`key: number`) and the current nested shape (`key: { score }`).
 * Returns null when the entry is missing or unscored.
 */
export function readRubricEntryScore(
  entry: SubmissionRubricEntry | undefined | null
): number | null {
  if (entry === undefined || entry === null) return null;
  if (typeof entry === 'number') return toFiniteScore(entry);
  if (typeof entry === 'object') return toFiniteScore(entry.score);
  return null;
}

/**
 * The five-band histogram, as a position in the category's own range rather
 * than as the raw score. On the default one-to-five rubric this is still the
 * rounded score; on anything else it is where in that rubric the score sits.
 */
function toBand(
  category: Pick<InsightRubricCategory, 'minScore' | 'maxScore'>,
  score: number
): ScoreBand | null {
  const fraction = scoreFraction(category, score);
  if (fraction === null) return null;
  return (Math.round(fraction * 4) + 1) as ScoreBand;
}

export function aggregateRubricPerformance(
  submissions: GradedSubmissionInput[],
  /** The rubric the class was actually graded on. */
  rubric: InsightRubric = DEFAULT_INSIGHT_RUBRIC
): ClassRubricAggregate {
  const categories: CategoryAggregate[] = rubric.categories.map((category) => {
    const scores: number[] = [];
    const comments: string[] = [];
    const distribution = emptyDistribution();
    let lowCount = 0;
    let highCount = 0;

    for (const submission of submissions) {
      const entry = submission.rubricScores?.[category.key];
      if (entry === undefined || entry === null) continue;

      // Support both the legacy flat shape ({ key: number }) and the current
      // nested shape ({ key: { score, comment } }).
      let score: number | null;
      let comment = '';
      if (typeof entry === 'number') {
        score = toFiniteScore(entry);
      } else if (typeof entry === 'object') {
        score = toFiniteScore(entry.score);
        comment = typeof entry.comment === 'string' ? entry.comment.trim() : '';
      } else {
        continue;
      }

      if (score !== null) {
        scores.push(score);
        const band = toBand(category, score);
        if (band !== null) distribution[band] += 1;
        if (isLowScore(category, score)) lowCount += 1;
        if (isHighScore(category, score)) highCount += 1;
      }

      if (comment && comments.length < SAMPLE_COMMENT_CAP) {
        comments.push(comment);
      }
    }

    const averageScore =
      scores.length > 0
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : null;

    return {
      key: category.key,
      label: category.label,
      weight: category.weight,
      averageScore,
      scoredCount: scores.length,
      distribution,
      lowCount,
      highCount,
      sampleComments: comments,
    };
  });

  const scored = categories.filter((c) => c.averageScore !== null);
  const strongest =
    scored.length > 0
      ? scored.reduce((best, c) =>
          (c.averageScore as number) > (best.averageScore as number) ? c : best
        ).key
      : null;
  const weakest =
    scored.length > 0
      ? scored.reduce((worst, c) =>
          (c.averageScore as number) < (worst.averageScore as number)
            ? c
            : worst
        ).key
      : null;

  return {
    submissionCount: submissions.length,
    categories,
    strongest,
    weakest,
  };
}
