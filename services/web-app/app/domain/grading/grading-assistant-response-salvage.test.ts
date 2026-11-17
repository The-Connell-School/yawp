import { describe, expect, test } from 'bun:test';
import { rubricKeys } from '~/domain/grading/rubric';
import {
  salvageGradingAssistantCategories,
  snapScoreToCategory,
  neutralOverallCommentFallback,
} from './grading-assistant-response-salvage';

const legacyCategories = rubricKeys.map((key) => ({
  key,
  label: key,
  description: 'desc',
  weight: 1,
}));

describe('grading-assistant-response-salvage', () => {
  test('snaps an out-of-band score to rubric min/max', () => {
    const snapped = snapScoreToCategory({
      category: legacyCategories[0],
      rawScore: 99,
      minScore: 0,
      maxScore: 5,
    });
    expect(snapped).toBe(5);
  });

  test('rounds half points before snapping in step mode', () => {
    const category = {
      ...legacyCategories[0],
      allowedScores: [0, 2, 4],
    };
    const snapped = snapScoreToCategory({
      category,
      rawScore: 2.6,
      minScore: 0,
      maxScore: 5,
      gradingMode: 'step',
    });
    expect(snapped).toBe(2);
  });

  test('salvages categories from malformed rows and drops unknown keys', () => {
    const { categories, missingKeys } = salvageGradingAssistantCategories({
      sources: [
        {
          categories: [
            { key: rubricKeys[0], score: 4.5, comment: '  ' },
            { key: 'unknown', score: 1 },
            { key: rubricKeys[1], score: 6, comment: 'Solid thesis.' },
          ],
        },
      ],
      rubricCategories: legacyCategories.slice(0, 2),
      minScore: 0,
      maxScore: 5,
      gradingMode: 'bands',
      categoryFeedbackEnabled: true,
    });
    expect(missingKeys).toEqual([]);
    expect(categories[0].score).toBe(5);
    expect(categories[0].comment).toBe('See overall feedback.');
    expect(categories[1].score).toBe(5);
  });

  test('reports missing rubric keys for targeted repair', () => {
    const { missingKeys } = salvageGradingAssistantCategories({
      sources: [{ categories: [{ key: rubricKeys[0], score: 3, comment: 'ok' }] }],
      rubricCategories: legacyCategories.slice(0, 2),
      minScore: 0,
      maxScore: 5,
      categoryFeedbackEnabled: true,
    });
    expect(missingKeys).toEqual([rubricKeys[1]]);
  });

  test('builds a neutral overall comment fallback', () => {
    expect(neutralOverallCommentFallback('Jordan')).toBe(
      'Jordan, thank you for sharing your work.'
    );
  });
});