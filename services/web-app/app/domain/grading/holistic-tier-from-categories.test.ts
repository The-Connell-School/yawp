import { describe, expect, test } from 'bun:test';
import cristoRey from '~/domain/rubrics/library/cristo-rey-hornbuckle-five-paragraph-essay.json';
import {
  holisticTierForPercentage,
  inferHolisticTupleFromCategoryScores,
} from './holistic-tier-from-categories';

describe('inferHolisticTupleFromCategoryScores', () => {
  const categories = cristoRey.rubric.categories;

  test('derives tier and points from six 1–4 band scores on a 20-point assignment', () => {
    const rubricScores = Object.fromEntries(
      categories.map((category) => [category.key, { score: 3, comment: '' }])
    );

    const inferred = inferHolisticTupleFromCategoryScores({
      rubricScores,
      rubricCategories: categories,
      assignmentTotal: 20,
    });

    expect(inferred).not.toBeNull();
    expect(inferred?.overallTier).toBe('needs_more');
    expect(inferred?.overallPoints).toBe(15);
  });

  test('returns null when category scores are unscored sentinels', () => {
    const rubricScores = Object.fromEntries(
      categories.map((category) => [category.key, { score: 0, comment: '' }])
    );

    expect(
      inferHolisticTupleFromCategoryScores({
        rubricScores,
        rubricCategories: categories,
        assignmentTotal: 20,
      })
    ).toBeNull();
  });
});

describe('holisticTierForPercentage', () => {
  test('maps percentage breakpoints to tiers', () => {
    expect(holisticTierForPercentage(92)).toBe('excellent');
    expect(holisticTierForPercentage(85)).toBe('good');
    expect(holisticTierForPercentage(75)).toBe('needs_more');
    expect(holisticTierForPercentage(55)).toBe('not_present');
  });
});
