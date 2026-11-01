import { describe, expect, test } from 'bun:test';

import {
  CLASS_STARTER_THREE_BAND_RUBRIC_NAME,
  CLASS_STARTER_THREE_BAND_SCHEMA,
  CLASS_STARTER_THREE_BAND_SCORE_LABELS,
} from './class-starter-three-band-rubric';
import { CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY } from './class-starter-rubric';
import { parseRubricSchema } from '~/domain/rubrics/rubric-schema';
import { validateRubricPromotion } from '~/domain/rubrics/rubric-promotion';
import {
  pointsScaleGradeFields,
  scalePointScore,
} from '~/domain/grading/gradeMath';
import {
  isCategoryFeedbackEnabled,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

describe('the three-band Class Starter rubric', () => {
  test('has exactly three bands: Excellent, Partial Credit, No Credit', () => {
    expect(CLASS_STARTER_THREE_BAND_SCORE_LABELS).toEqual([
      { value: 0, label: 'No Credit' },
      { value: 1, label: 'Partial Credit' },
      { value: 2, label: 'Excellent' },
    ]);
  });

  test('keeps the engagement category key, so it reads the same class-wide', () => {
    const categories = CLASS_STARTER_THREE_BAND_SCHEMA.rubric.categories;
    expect(categories).toHaveLength(1);
    expect(categories[0]?.key).toBe(CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY);
    expect(categories[0]?.weight).toBe(1);
  });

  test('stays soft: overall feedback only, no grammar markup', () => {
    const categories = CLASS_STARTER_THREE_BAND_SCHEMA.rubric.categories;
    expect(isCategoryFeedbackEnabled(categories[0]!)).toBe(false);
    expect(resolveGrammarHighlightingEnabled(categories)).toBe(false);
  });

  test('scores on every whole number of its scale, with no step to snap to', () => {
    expect(CLASS_STARTER_THREE_BAND_SCHEMA.scoringScale).toEqual({
      type: 'points_scale',
      minScore: 0,
      maxScore: 2,
    });
  });

  test('tells the grader the three words and what earns each', () => {
    const instructions =
      CLASS_STARTER_THREE_BAND_SCHEMA.promptConfig.gradingInstructions ?? '';
    expect(instructions).toContain('2, Excellent');
    expect(instructions).toContain('1, Partial Credit');
    expect(instructions).toContain('0, No Credit');
    expect(instructions.toLowerCase()).toContain('do not grade grammar');
    expect(instructions).not.toContain('All in');
    expect(instructions).not.toContain('Hardly there');
  });

  test('is a valid library rubric that Yawp Internal can promote', () => {
    const parsed = parseRubricSchema(CLASS_STARTER_THREE_BAND_SCHEMA);
    expect(parsed.ok).toBe(true);
    expect(CLASS_STARTER_THREE_BAND_SCHEMA.name).toBe(
      CLASS_STARTER_THREE_BAND_RUBRIC_NAME
    );
    expect(validateRubricPromotion(CLASS_STARTER_THREE_BAND_SCHEMA)).toEqual(
      expect.objectContaining({ ok: true })
    );
  });

  test.each([
    [5, ['0/5', '3/5', '5/5']],
    [10, ['0/10', '5/10', '10/10']],
    [20, ['0/20', '10/20', '20/20']],
  ])(
    'puts each band on a %i-point assignment as whole points',
    (pointValue, expected) => {
      const scaled = [0, 1, 2].map((score) => {
        const fields = pointsScaleGradeFields({
          categories: [{ score }],
          maxScore: 2,
        });
        const points = scalePointScore(fields.score, pointValue);
        expect(Number.isInteger(points?.earned)).toBe(true);
        return `${points?.earned}/${points?.possible}`;
      });
      expect(scaled).toEqual(expected);
    }
  );
});
