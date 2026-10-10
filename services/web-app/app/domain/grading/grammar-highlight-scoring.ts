import {
  isGrammarHighlightCategory,
  type RubricCategoryOptions,
} from '~/domain/assignment-types/rubric-category-options';
import type { ResolvedDisplayOptions } from '~/domain/rubrics/output-schema-display';

type GradedCategory = {
  key: string;
  score: number;
  comment?: string;
  grammarImpairsMeaning?: boolean | null;
};

export function applyGrammarHighlightScoreClamp<
  T extends GradedCategory,
>({
  categories,
  rubricCategories,
  minScore,
  maxScore,
  display,
}: {
  categories: T[];
  rubricCategories: readonly Partial<RubricCategoryOptions>[];
  minScore: number;
  maxScore: number;
  display: ResolvedDisplayOptions;
}): T[] {
  if (display.grammarHighlight !== 'highlight') return categories;

  const grammarKeys = new Set(
    rubricCategories
      .filter((category) => {
        if (!category.key) return false;
        return isGrammarHighlightCategory(category as RubricCategoryOptions);
      })
      .map((category) => category.key)
  );
  if (grammarKeys.size === 0) return categories;

  return categories.map((category) => {
    if (!grammarKeys.has(category.key)) return category;
    if (category.score >= maxScore) return category;
    if (category.grammarImpairsMeaning === true) return category;
    return { ...category, score: maxScore };
  });
}

export function grammarHighlightHolisticCapInstructions(
  display: ResolvedDisplayOptions
) {
  if (display.grammarHighlight !== 'highlight') return [];
  if (display.grammarMaxDeductionPct == null) return [];
  return [
    `If mechanics would lower the holistic grade, cap that deduction at ${display.grammarMaxDeductionPct}% of the assignment total and explain the deduction in one sentence at the end of overallComment.`,
  ];
}
