import {
  isGrammarHighlightCategory,
  type RubricCategoryOptions,
} from '~/domain/assignment-types/rubric-category-options';
import type { ResolvedDisplayOptions } from '~/domain/rubrics/output-schema-display';

type GradedCategory = {
  key: string;
  score: number;
  comment?: string;
};

function meaningImpaired(comment: string | undefined, grammarImpairsMeaning?: boolean) {
  if (grammarImpairsMeaning === true) return true;
  if (!comment?.trim()) return false;
  const normalized = comment.toLowerCase();
  return (
    normalized.includes('hard to read') ||
    normalized.includes('difficult to read') ||
    normalized.includes('must reread') ||
    normalized.includes('have to reread') ||
    normalized.includes('obscures meaning') ||
    normalized.includes('impair meaning') ||
    normalized.includes('impairs meaning') ||
    normalized.includes('interfere with understanding') ||
    normalized.includes('interferes with understanding')
  );
}

export function applyGrammarHighlightScoreClamp<
  T extends GradedCategory,
>({
  categories,
  rubricCategories,
  minScore,
  maxScore,
  display,
  grammarImpairsMeaning,
}: {
  categories: T[];
  rubricCategories: readonly Partial<RubricCategoryOptions>[];
  minScore: number;
  maxScore: number;
  display: ResolvedDisplayOptions;
  grammarImpairsMeaning?: boolean | null;
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
    if (meaningImpaired(category.comment, grammarImpairsMeaning ?? undefined)) {
      return category;
    }
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
