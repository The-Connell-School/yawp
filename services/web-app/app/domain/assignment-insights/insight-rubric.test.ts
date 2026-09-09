import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_INSIGHT_RUBRIC,
  insightRubricFromCategories,
  isHighScore,
  isLowScore,
  midpointScore,
  scoreFraction,
} from './insight-rubric';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';

const category = (over: Partial<RubricCategory> = {}): RubricCategory => ({
  key: 'executive_summary',
  label: 'Executive Summary',
  weight: 0.1,
  description: '',
  ...over,
});

describe('DEFAULT_INSIGHT_RUBRIC', () => {
  test('is the five default categories, scored one to five', () => {
    expect(DEFAULT_INSIGHT_RUBRIC.categories).toHaveLength(5);
    expect(DEFAULT_INSIGHT_RUBRIC.categories[0]).toEqual({
      key: 'thesis_and_content',
      label: 'Thesis/Content',
      weight: 0.25,
      minScore: 1,
      maxScore: 5,
    });
  });

  test('keeps the thresholds this folder has always used', () => {
    // The whole change is safe only if the default rubric behaves exactly as
    // before: low is a 2 or less, strong is a 4 or more.
    const [thesis] = DEFAULT_INSIGHT_RUBRIC.categories;

    expect(isLowScore(thesis!, 2)).toBe(true);
    expect(isLowScore(thesis!, 3)).toBe(false);
    expect(isHighScore(thesis!, 4)).toBe(true);
    expect(isHighScore(thesis!, 3)).toBe(false);
  });
});

describe('insightRubricFromCategories', () => {
  test('takes the assignment type’s categories and score range', () => {
    const rubric = insightRubricFromCategories({
      categories: [category(), category({ key: 'budget', label: 'Budget', weight: 0.2 })],
      minScore: 0,
      maxScore: 100,
    });

    expect(rubric.categories).toEqual([
      {
        key: 'executive_summary',
        label: 'Executive Summary',
        weight: 0.1,
        minScore: 0,
        maxScore: 100,
      },
      { key: 'budget', label: 'Budget', weight: 0.2, minScore: 0, maxScore: 100 },
    ]);
  });

  test('a category’s own bands beat the rubric-wide range', () => {
    // Bands are the range that category is actually marked in, and are what
    // grading validates a score against.
    const rubric = insightRubricFromCategories({
      categories: [
        category({
          bands: [
            { min: 0, max: 6, label: 'Struggling', description: '' },
            { min: 7, max: 10, label: 'Proficient', description: '' },
          ],
        }),
      ],
      minScore: 0,
      maxScore: 100,
    });

    expect(rubric.categories[0]).toMatchObject({ minScore: 0, maxScore: 10 });
  });

  test('refuses a zero-width range rather than dividing by it', () => {
    const rubric = insightRubricFromCategories({
      categories: [category()],
      minScore: 4,
      maxScore: 4,
    });

    expect(rubric.categories[0]!.maxScore).toBeGreaterThan(
      rubric.categories[0]!.minScore
    );
  });
});

describe('scoreFraction', () => {
  test('places a score in its own range, whatever that range is', () => {
    expect(scoreFraction({ minScore: 1, maxScore: 5 }, 3)).toBe(0.5);
    expect(scoreFraction({ minScore: 0, maxScore: 100 }, 25)).toBe(0.25);
    expect(scoreFraction({ minScore: 0, maxScore: 10 }, 9)).toBeCloseTo(0.9);
  });

  test('reports a score outside the range as unplaceable', () => {
    expect(scoreFraction({ minScore: 1, maxScore: 5 }, 7)).toBeNull();
    expect(scoreFraction({ minScore: 1, maxScore: 5 }, 0)).toBeNull();
  });
});

describe('isLowScore and isHighScore', () => {
  test('mean the same thing on a hundred-point rubric as on a five-point one', () => {
    const hundred = { minScore: 0, maxScore: 100 };

    expect(isLowScore(hundred, 25)).toBe(true);
    expect(isLowScore(hundred, 26)).toBe(false);
    expect(isHighScore(hundred, 75)).toBe(true);
    expect(isHighScore(hundred, 74)).toBe(false);
  });

  test('a score off the bottom or top of the range still counts', () => {
    // Otherwise a 0 on a rubric that starts at 1 would be dropped from exactly
    // the count it most belongs in.
    expect(isLowScore({ minScore: 1, maxScore: 5 }, 0)).toBe(true);
    expect(isHighScore({ minScore: 1, maxScore: 5 }, 6)).toBe(true);
  });
});

describe('midpointScore', () => {
  test('is the middle of the category’s range', () => {
    expect(midpointScore({ minScore: 1, maxScore: 5 })).toBe(3);
    expect(midpointScore({ minScore: 0, maxScore: 100 })).toBe(50);
  });
});
