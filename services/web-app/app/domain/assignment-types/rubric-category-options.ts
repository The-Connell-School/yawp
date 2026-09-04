import type {
  RubricScoreBand,
  RubricScoreLabel,
} from './assignment-type-rubric.shared';

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
  bands?: RubricScoreBand[];
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

/**
 * Parses the optional per-category proficiency bands. Returns undefined rather
 * than an empty array so a category that never declared bands stays exactly as
 * it was stored, and sorts ascending so the bands read low to high wherever
 * they are shown.
 */
export function parseRubricScoreBands(
  raw: unknown
): RubricScoreBand[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const bands = raw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const { min, max, label, description } = entry;
      if (typeof min !== 'number' || !Number.isFinite(min)) return null;
      if (typeof max !== 'number' || !Number.isFinite(max)) return null;
      if (max < min) return null;
      if (typeof label !== 'string' || !label.trim()) return null;
      return {
        min,
        max,
        label: label.trim(),
        description:
          typeof description === 'string' ? description.trim() : '',
      };
    })
    .filter((entry): entry is RubricScoreBand => entry !== null)
    .sort((a, b) => a.min - b.min);

  return bands.length > 0 ? bands : undefined;
}

/** The band a score falls in, if the category declares bands covering it. */
export function getCategoryScoreBand(
  category: Partial<RubricCategoryOptions>,
  score: number
) {
  return (
    category.bands?.find((band) => score >= band.min && score <= band.max) ??
    null
  );
}

/** Raw score range declared by one category's proficiency bands. */
export function getCategoryScoreBounds(
  category: Partial<RubricCategoryOptions>
): { min: number; max: number } | null {
  const bands = category.bands ?? [];
  if (bands.length === 0) return null;

  return bands.reduce(
    (bounds, band) => ({
      min: Math.min(bounds.min, band.min),
      max: Math.max(bounds.max, band.max),
    }),
    { min: bands[0].min, max: bands[0].max }
  );
}

/** A non-banded category keeps the rubric-wide score validation path. */
export function isScoreInCategoryBands(
  category: Partial<RubricCategoryOptions>,
  score: number
) {
  if (!category.bands?.length) return true;
  return getCategoryScoreBand(category, score) !== null;
}

/**
 * Whether this rubric is scored directly on the scale its bands are written in.
 *
 * Every category has to declare bands for that to hold: a rubric where only
 * some do cannot be scored consistently across its categories, so it keeps the
 * older path rather than scoring half one way and half the other.
 */
export function isBandScoredRubric(
  categories: Partial<RubricCategoryOptions>[]
) {
  return (
    categories.length > 0 &&
    categories.every((category) => (category.bands?.length ?? 0) > 0)
  );
}

export function parseOptionalBoolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

/** Per-category feedback textareas are on unless a category opts out. */
export function isCategoryFeedbackEnabled(
  category: Partial<RubricCategoryOptions>
) {
  return category.feedbackEnabled !== false;
}

/**
 * Whether this category is the one that drives grammar/syntax highlighting.
 * An explicit flag always wins; otherwise fall back to the legacy key match so
 * every rubric saved before this setting behaves exactly as it did.
 */
export function isGrammarHighlightCategory(
  category: RubricCategoryOptions
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
  categories: Partial<RubricCategoryOptions>[]
) {
  const hasExplicitFlag = categories.some(
    (category) => typeof category.grammarHighlighting === 'boolean'
  );
  if (!hasExplicitFlag) return true;
  return categories.some((category) => category.grammarHighlighting === true);
}

/** The configured word for a score value in this category, if there is one. */
export function getCategoryScoreLabel(
  category: Partial<RubricCategoryOptions>,
  score: number
) {
  return (
    category.scoreLabels?.find((entry) => entry.value === score)?.label ?? null
  );
}
