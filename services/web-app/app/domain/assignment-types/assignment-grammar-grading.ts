import {
  isGrammarHighlightCategory,
  resolveGrammarHighlightingEnabled,
  type RubricCategoryOptions,
} from './rubric-category-options';

/**
 * The teacher's per-assignment answer to "is this one graded for grammar and
 * syntax?", applied to a rubric.
 *
 * A Daily Pages entry is graded like a short essay, grammar included. But not
 * every quick write wants that: the same teacher may want one graded for
 * correctness and the next graded only on the thinking. This is that switch,
 * and it lives on the Assignment rather than the assignment type so it can
 * differ between two assignments built from the same type.
 *
 * Turning it off removes the grammar category outright, which is what "not
 * graded for grammar" has to mean: the category is not scored, the writing is
 * not marked up, and the weighted composite renormalizes over the categories
 * that remain — `computeWeightedBandPercentage` already divides by the weight
 * actually present, so no weight has to be redistributed by hand.
 */

/**
 * Whether the toggle is worth showing for a rubric. It only ever turns grammar
 * grading off, so there has to be grammar grading to turn off: switching it on
 * cannot invent a grammar category for a rubric that has none.
 */
export function isGrammarGradingConfigurable(
  categories: readonly Partial<RubricCategoryOptions>[]
) {
  // An empty rubric reads as "grammar on" through the legacy default, but there
  // is no rubric yet to configure, so there is nothing to offer a teacher.
  if (categories.length === 0) return false;
  return resolveGrammarHighlightingEnabled([...categories]);
}

/**
 * `null` and `undefined` mean the assignment has no preference and the rubric
 * decides — which is every assignment that existed before this toggle, so
 * their grading is untouched.
 */
export function applyAssignmentGrammarGrading<T extends RubricCategoryOptions>(
  categories: readonly T[],
  grammarGradingEnabled: boolean | null | undefined
): T[] {
  if (grammarGradingEnabled !== false) return [...categories];

  const remaining = categories.filter(
    (category) => !isGrammarHighlightCategory(category)
  );

  // A rubric that is nothing but grammar would be left with no categories at
  // all, which grades nothing and divides by zero downstream. Keeping it whole
  // is the safer failure: the teacher sees grammar graded, rather than a
  // submission that cannot be scored.
  return remaining.length > 0 ? remaining : [...categories];
}
