import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  getCategoryScoreBand,
  type RubricCategoryOptions,
} from '~/domain/assignment-types/rubric-category-options';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const GENERIC_BAND_LABEL_TO_SCORE: Record<string, number> = {
  beginning: 1,
  developing: 2,
  proficient: 3,
  advanced: 4,
  strong: 4,
  exemplary: 5,
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function scoreFromBandLabel(
  label: string,
  category: Partial<RubricCategoryOptions>
) {
  const normalized = normalizeLabel(label);
  const fromCategory = category.bands?.find(
    (band) => normalizeLabel(band.label) === normalized
  );
  if (fromCategory) return fromCategory.min;
  return GENERIC_BAND_LABEL_TO_SCORE[normalized] ?? null;
}

function coerceCategoryScore(
  item: Record<string, unknown>,
  category: Partial<RubricCategoryOptions> | undefined
) {
  const rawScore = item.score ?? item.band ?? item.level ?? item.rating;
  if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
    return Math.round(rawScore);
  }
  if (typeof rawScore === 'string') {
    const trimmed = rawScore.trim();
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && trimmed !== '') {
      return Math.round(asNumber);
    }
    const fromLabel = scoreFromBandLabel(trimmed, category ?? {});
    if (fromLabel !== null) return fromLabel;
  }
  return undefined;
}

function mapCategoriesObjectToArray(
  categoriesObject: Record<string, unknown>
) {
  return Object.entries(categoriesObject).map(([key, value]) => {
    if (isRecord(value)) {
      return { key, ...value };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { key, score: Math.round(value) };
    }
    if (typeof value === 'string') {
      return { key, score: value };
    }
    return { key };
  });
}

/**
 * Expands common alternate model shapes into a categories array before Zod
 * validation: keyed objects, nested maps, or band labels instead of integers.
 */
export function expandGradingAssistantCategoriesInput(
  input: unknown,
  rubricCategories: readonly Pick<RubricCategory, 'key' | 'bands'>[]
): unknown {
  const categoryByKey = new Map(
    rubricCategories.map((category) => [category.key, category])
  );

  let categoriesCandidate: unknown = input;

  if (isRecord(input)) {
    if (Array.isArray(input.categories)) {
      categoriesCandidate = input.categories;
    } else if (isRecord(input.categories)) {
      categoriesCandidate = mapCategoriesObjectToArray(input.categories);
    } else if (isRecord(input.rubricScores)) {
      categoriesCandidate = mapCategoriesObjectToArray(input.rubricScores);
    } else if (isRecord(input.scores)) {
      categoriesCandidate = mapCategoriesObjectToArray(input.scores);
    } else {
      const keys = Object.keys(input);
      const looksLikeCategoryMap =
        keys.length > 0 && keys.every((key) => categoryByKey.has(key));
      if (looksLikeCategoryMap) {
        categoriesCandidate = mapCategoriesObjectToArray(input);
      }
    }
  }

  if (!Array.isArray(categoriesCandidate)) return categoriesCandidate;

  return categoriesCandidate.map((entry) => {
    if (!isRecord(entry)) return entry;
    const key =
      typeof entry.key === 'string'
        ? entry.key
        : typeof entry.category === 'string'
          ? entry.category
          : typeof entry.name === 'string'
            ? entry.name
            : undefined;
    const configured = key ? categoryByKey.get(key) : undefined;
    const coercedScore = coerceCategoryScore(entry, configured);
    if (coercedScore === undefined) return entry;
    return { ...entry, ...(key ? { key } : {}), score: coercedScore };
  });
}

export function categoriesArrayToRubricScoreMap(
  categories: Array<{ key: string; score: number }>
) {
  return Object.fromEntries(
    categories.map((category) => [
      category.key,
      { score: category.score, comment: '' },
    ])
  );
}

export function scoreIsInCategoryBands(
  category: Partial<RubricCategoryOptions>,
  score: number
) {
  return getCategoryScoreBand(category, score) !== null;
}
