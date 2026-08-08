import type { RubricScoreLabel } from './assignment-type-rubric.shared';

/**
 * Category keys that produced grammar/syntax highlighting before highlighting
 * became a per-category setting. Rubrics saved before that setting existed have
 * no `grammarHighlighting` flag, so these keys remain the fallback signal.
 */
export const LEGACY_GRAMMAR_CATEGORY_KEYS = [
  'grammar_and_mechanics',
  'language_use_and_conventions',
] as const;

/**
 * The subset of a rubric category the customizable options depend on. Kept
 * structural so snapshot categories, display categories, and stored categories
 * can all be passed without conversion.
 */
export type RubricCategoryOptions = {
  key: string;
  scoreLabels?: RubricScoreLabel[];
  feedbackEnabled?: boolean;
  grammarHighlighting?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Parses the optional per-category score labels. Returns undefined — never an
 * empty array — so a category that never configured labels stays byte-identical
 * to how it was stored.
 */
export function parseRubricScoreLabels(
  raw: unknown
): RubricScoreLabel[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const labels = raw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const value = entry.value;
      const label = entry.label;
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      if (typeof label !== 'string' || !label.trim()) return null;
      return { value: Math.round(value), label: label.trim() };
    })
    .filter((entry): entry is RubricScoreLabel => entry !== null);

  return labels.length > 0 ? labels : undefined;
}

export function parseOptionalBoolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

/** Per-category feedback textareas are on unless a category opts out. */
export function isCategoryFeedbackEnabled(
  category: Pick<RubricCategoryOptions, 'feedbackEnabled'>
) {
  return category.feedbackEnabled !== false;
}

/**
 * Whether this category is the one that drives grammar/syntax highlighting.
 * An explicit flag always wins; otherwise fall back to the legacy key match so
 * every rubric saved before this setting behaves exactly as it did.
 */
export function isGrammarHighlightCategory(
  category: Pick<RubricCategoryOptions, 'key' | 'grammarHighlighting'>
) {
  if (typeof category.grammarHighlighting === 'boolean') {
    return category.grammarHighlighting;
  }
  return (LEGACY_GRAMMAR_CATEGORY_KEYS as readonly string[]).includes(
    category.key
  );
}

/**
 * Whether the grammar/syntax highlighting pass should run at all for a rubric.
 *
 * Grammar highlighting has always run unconditionally, so a rubric where no
 * category expresses an opinion keeps running it. Only a rubric that explicitly
 * opts every category out turns it off.
 */
export function resolveGrammarHighlightingEnabled(
  categories: Pick<RubricCategoryOptions, 'grammarHighlighting'>[]
) {
  const hasExplicitFlag = categories.some(
    (category) => typeof category.grammarHighlighting === 'boolean'
  );
  if (!hasExplicitFlag) return true;
  return categories.some((category) => category.grammarHighlighting === true);
}

/** The configured word for a score value in this category, if there is one. */
export function getCategoryScoreLabel(
  category: Pick<RubricCategoryOptions, 'scoreLabels'>,
  score: number
) {
  return (
    category.scoreLabels?.find((entry) => entry.value === score)?.label ?? null
  );
}
