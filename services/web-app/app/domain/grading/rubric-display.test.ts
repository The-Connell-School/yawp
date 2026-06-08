import { describe, expect, test } from 'bun:test';
import { normalizeRubricScoresForCategories } from './rubric-display';

const actCategories = [
  {
    key: 'ideas_and_analysis',
    label: 'Ideas and Analysis',
    description: '',
    weight: 1,
  },
];

describe('normalizeRubricScoresForCategories', () => {
  test('preserves zero as an unscored rubric value', () => {
    const normalized = normalizeRubricScoresForCategories({
      raw: {
        ideas_and_analysis: {
          score: 0,
          comment: '',
        },
      },
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
    });

    expect(normalized.ideas_and_analysis.score).toBe(0);
  });
});
