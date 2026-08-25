import {
  rubricCategories as legacyRubricCategories,
} from '~/domain/grading/rubric';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';

export type InsightRubricCategory = {
  key: string;
  label: string;
  weight: number;
};

/** Canonical thesis-driven essay categories — used when no assignment rubric exists. */
export function defaultInsightRubricCategories(): InsightRubricCategory[] {
  return legacyRubricCategories.map((category) => ({
    key: category.key,
    label: category.label,
    weight: category.weight,
  }));
}

export function insightRubricCategoriesFromAssignmentType(
  categories: RubricCategory[]
): InsightRubricCategory[] {
  if (categories.length === 0) {
    return defaultInsightRubricCategories();
  }

  return categories.map((category) => ({
    key: category.key,
    label: category.label,
    weight: category.weight,
  }));
}
