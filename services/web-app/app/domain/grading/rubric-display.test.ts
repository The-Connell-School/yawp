import { describe, expect, test } from 'bun:test';
import {
  normalizeRubricDisplayConfig,
  normalizeRubricScoresForCategories,
} from './rubric-display';

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

describe('normalizeRubricDisplayConfig', () => {
  test('preserves a thesis-default source flag so the UI can warn about the fallback', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
      source: 'thesis-default',
    });

    expect(normalized.source).toBe('thesis-default');
  });

  test('preserves an assignment-type source flag', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
      source: 'assignment-type',
    });

    expect(normalized.source).toBe('assignment-type');
  });

  test('drops an unrecognized source value', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
      source: 'bogus',
    });

    expect(normalized.source).toBeUndefined();
  });
});
