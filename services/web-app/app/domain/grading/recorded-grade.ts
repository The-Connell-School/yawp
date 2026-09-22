import {
  isPointsScaleScoringType,
  pointsScaleGradeFields,
} from './gradeMath';
import { isScored, type RubricDisplayCategory } from './rubric-display';

/** The ACT writing scale, which reports a 2-12 composite rather than a percent. */
export const ACT_WRITING_SCORING_TYPE = 'act_writing_2_12';

/**
 * The grade fields a scoring scale records.
 *
 * A percentage scale records `numericPercentage` and a letter. A scale that
 * reports raw points — Daily Pages, ACT writing — records `overallScore` and
 * a `score` string, and has no percentage at all. Both are grades; only the
 * shape differs.
 */
export type ScaleGradeFields = {
  overallScore: number;
  numericPercentage: number | null;
  letterGrade: string | null;
  score: string;
};

export type RecordedGradeSignals = {
  numericPercentage?: number | null;
  overallScore?: number | null;
  score?: string | null;
};

/**
 * Whether a submission carries a recorded overall grade.
 *
 * This is the single definition of "this has been graded". Reading it as
 * `numericPercentage != null` is what made every points-scale submission —
 * whose grade is `overallScore` plus a `score` string and never a percentage —
 * look ungraded to the student view, the lifecycle state, and the release gate.
 */
export function hasRecordedGrade(signals: RecordedGradeSignals): boolean {
  if (signals.numericPercentage != null) return true;
  if (signals.overallScore != null) return true;
  return typeof signals.score === 'string' && signals.score.trim() !== '';
}

/**
 * The overall grade a set of category scores produces on a raw-points scale.
 *
 * Returns null for percentage scales, whose overall grade comes from the
 * weighted percentage instead, and for an empty category list.
 */
export function rubricScaleGradeFields({
  categories,
  scoringType,
  maxScore,
}: {
  categories: Array<{ score: number }>;
  scoringType: string;
  maxScore: number;
}): ScaleGradeFields | null {
  if (categories.length === 0) return null;

  if (isPointsScaleScoringType(scoringType)) {
    return pointsScaleGradeFields({ categories, maxScore });
  }

  if (scoringType === ACT_WRITING_SCORING_TYPE) {
    const average =
      categories.reduce((sum, item) => sum + item.score, 0) / categories.length;
    const composite = Math.max(2, Math.min(12, Math.round(average * 2)));
    return {
      overallScore: composite,
      numericPercentage: null,
      letterGrade: null,
      score: `${composite}/12`,
    };
  }

  return null;
}

/**
 * The same overall grade, read off a rubric score map rather than a list.
 *
 * Every category must carry a real score on this scale: a rubric the teacher
 * has only partly filled in produces no grade rather than a misleadingly
 * averaged one, and the not-yet-scored sentinel never counts as a zero.
 */
export function rubricScaleGradeFieldsFromScores({
  rubricScores,
  categories,
  minScore,
  maxScore,
  scoringType,
}: {
  rubricScores:
    | Record<
        string,
        { score?: number | null; comment?: string; isAi?: boolean } | undefined
      >
    | null
    | undefined;
  categories: readonly RubricDisplayCategory[];
  minScore: number;
  maxScore: number;
  scoringType: string;
}): ScaleGradeFields | null {
  if (!rubricScores || categories.length === 0) return null;

  const scored: Array<{ score: number }> = [];
  for (const category of categories) {
    const entry = rubricScores[category.key];
    if (!entry || !isScored(entry.score, minScore)) return null;
    scored.push({ score: entry.score });
  }

  return rubricScaleGradeFields({ categories: scored, scoringType, maxScore });
}
