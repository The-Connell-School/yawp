import { rubricCategories } from '~/domain/grading/rubric';
import { getCategoryScoreBounds } from '~/domain/assignment-types/rubric-category-options';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';

/**
 * The rubric a class summary is read against.
 *
 * Everything in this folder used to be written against the five default
 * categories in `~/domain/grading/rubric`, scored one to five. Grading has not
 * worked that way for a long time: an assignment type carries its own rubric,
 * its own categories and its own score range, and that is what the grading
 * assistant writes into `Submission.rubricScores`. So a class summary for any
 * assignment type but the default one was aggregating keys nothing had ever
 * been scored against, and reported every category as "not scored" — a summary
 * of nothing, indistinguishable from a class nobody had graded.
 *
 * This is the shape those modules take instead: whatever categories the
 * assignment is actually graded on, and the range each one is scored in. The
 * default rubric becomes one value of this type rather than the only one.
 *
 * Scores are compared as a fraction of each category's own range, so "strong"
 * and "struggling" mean the same thing on a nine-category business brief marked
 * out of 100 as on a five-category essay marked out of 5.
 */

export type InsightRubricCategory = {
  key: string;
  label: string;
  weight: number;
  /** The lowest score this category can be given. */
  minScore: number;
  /** The highest. Always greater than `minScore`. */
  maxScore: number;
};

export type InsightRubric = {
  categories: InsightRubricCategory[];
};

/**
 * Fractions of a category's range, not raw scores.
 *
 * On the default one-to-five rubric these are exactly the thresholds this
 * folder has always used — 0.25 is a 2, 0.75 is a 4 — so the summaries teachers
 * already have do not move.
 */
export const LOW_SCORE_FRACTION = 0.25;
export const HIGH_SCORE_FRACTION = 0.75;

/** The five-category, one-to-five rubric, for assignments with no rubric of their own. */
export const DEFAULT_INSIGHT_RUBRIC: InsightRubric = {
  categories: rubricCategories.map((category) => ({
    key: category.key,
    label: category.label,
    weight: category.weight,
    minScore: 1,
    maxScore: 5,
  })),
};

/**
 * An assignment type's rubric, in the shape the summary reads.
 *
 * A category's own proficiency bands win over the rubric-wide range when it
 * declares them: they are the range that category is actually marked in, and
 * they are what grading validates against.
 */
export function insightRubricFromCategories({
  categories,
  minScore,
  maxScore,
}: {
  categories: RubricCategory[];
  minScore: number;
  maxScore: number;
}): InsightRubric {
  return {
    categories: categories.map((category) => {
      const bounds = getCategoryScoreBounds(category);
      const low = bounds ? bounds.min : minScore;
      const high = bounds ? bounds.max : maxScore;
      return {
        key: category.key,
        label: category.label,
        weight: category.weight,
        minScore: low,
        // A zero-width range would make every fraction a division by zero, and
        // a rubric that cannot tell two scores apart has nothing to summarize.
        maxScore: high > low ? high : low + 1,
      };
    }),
  };
}

/** Where a score sits in its category's range, 0 to 1; null when outside it. */
export function scoreFraction(
  category: Pick<InsightRubricCategory, 'minScore' | 'maxScore'>,
  score: number
): number | null {
  const span = category.maxScore - category.minScore;
  if (span <= 0) return null;
  const fraction = (score - category.minScore) / span;
  if (fraction < 0 || fraction > 1) return null;
  return fraction;
}

export function isLowScore(
  category: Pick<InsightRubricCategory, 'minScore' | 'maxScore'>,
  score: number
): boolean {
  // Below the range counts as low; a score that fell off the bottom is not a
  // score to ignore.
  if (score <= category.minScore) return true;
  const fraction = scoreFraction(category, score);
  return fraction !== null && fraction <= LOW_SCORE_FRACTION;
}

export function isHighScore(
  category: Pick<InsightRubricCategory, 'minScore' | 'maxScore'>,
  score: number
): boolean {
  if (score >= category.maxScore) return true;
  const fraction = scoreFraction(category, score);
  return fraction !== null && fraction >= HIGH_SCORE_FRACTION;
}

/**
 * The score a "mixed" category is best exemplified by: the middle of its range.
 */
export function midpointScore(
  category: Pick<InsightRubricCategory, 'minScore' | 'maxScore'>
): number {
  return (category.minScore + category.maxScore) / 2;
}

export function insightRubricKeys(rubric: InsightRubric): Set<string> {
  return new Set(rubric.categories.map((category) => category.key));
}

export function insightRubricLabels(rubric: InsightRubric): Map<string, string> {
  return new Map(
    rubric.categories.map((category) => [category.key, category.label])
  );
}
