import { describe, expect, test } from 'bun:test';
import {
  ExtractedRubricSchema,
  normalizeExtractedRubric,
} from './rubric-extract.server';

describe('normalizeExtractedRubric — tiered rubrics', () => {
  // The Daily Pages rubric: four named tiers worth 30/20/10/0 on a 30-point
  // assignment. Extraction used to keep only the range, so it produced 31
  // score-label rows and dropped the tier names entirely.
  const dailyPagesPayload = {
    scoringScale: {
      type: 'rubric_points' as const,
      minScore: 0,
      maxScore: 30,
      step: 10,
    },
    rubric: {
      categories: [
        {
          label: 'Engagement',
          weight: 1,
          description: 'Willingness to put real thoughts on the page.',
          scoreLabels: [
            { value: 30, label: 'All in' },
            { value: 20, label: 'Showed up' },
            { value: 10, label: 'Hardly there' },
            { value: 0, label: 'Not handed in' },
          ],
        },
      ],
    },
  };

  test('keeps the step the tiers imply', () => {
    const result = normalizeExtractedRubric(
      ExtractedRubricSchema.parse(dailyPagesPayload)
    );

    expect(result.scoringScale.minScore).toBe(0);
    expect(result.scoringScale.maxScore).toBe(30);
    expect(result.scoringScale.step).toBe(10);
  });

  test('keeps the tier names as score labels, ordered by value', () => {
    const result = normalizeExtractedRubric(
      ExtractedRubricSchema.parse(dailyPagesPayload)
    );

    expect(result.rubric.categories[0].scoreLabels).toEqual([
      { value: 0, label: 'Not handed in' },
      { value: 10, label: 'Hardly there' },
      { value: 20, label: 'Showed up' },
      { value: 30, label: 'All in' },
    ]);
  });

  // The model does not always fill in the step, but the tier values say what
  // it must be: the gap they all sit on.
  test('infers the step from the tier values when the model omits it', () => {
    const result = normalizeExtractedRubric(
      ExtractedRubricSchema.parse({
        ...dailyPagesPayload,
        scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 30 },
      })
    );

    expect(result.scoringScale.step).toBe(10);
  });

  // Observed with the real Daily Pages rubric: the model reported every tier
  // correctly and still claimed step 1, producing 31 rows for four tiers.
  test('trusts the tier values over a step of 1 the model insists on', () => {
    const result = normalizeExtractedRubric(
      ExtractedRubricSchema.parse({
        ...dailyPagesPayload,
        scoringScale: {
          type: 'rubric_points',
          minScore: 0,
          maxScore: 30,
          step: 1,
        },
      })
    );

    expect(result.scoringScale.step).toBe(10);
    expect(result.rubric.categories[0].scoreLabels).toHaveLength(4);
  });

  test('ignores a step that cannot reach the max', () => {
    const result = normalizeExtractedRubric(
      ExtractedRubricSchema.parse({
        scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 30, step: 4 },
        rubric: { categories: [{ label: 'Engagement', weight: 1 }] },
      })
    );

    expect(result.scoringScale.step).toBe(1);
  });

  test('drops score labels that do not land on the grid', () => {
    const result = normalizeExtractedRubric(
      ExtractedRubricSchema.parse({
        scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 30, step: 10 },
        rubric: {
          categories: [
            {
              label: 'Engagement',
              weight: 1,
              scoreLabels: [
                { value: 10, label: 'Hardly there' },
                { value: 17, label: 'Nonsense' },
              ],
            },
          ],
        },
      })
    );

    expect(result.rubric.categories[0].scoreLabels).toEqual([
      { value: 10, label: 'Hardly there' },
    ]);
  });

  test('leaves an untiered rubric stepping by one', () => {
    const result = normalizeExtractedRubric(
      ExtractedRubricSchema.parse({
        scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
        rubric: { categories: [{ label: 'Thesis', weight: 1 }] },
      })
    );

    expect(result.scoringScale.step).toBe(1);
    expect(result.rubric.categories[0].scoreLabels).toBeUndefined();
  });
});

describe('normalizeExtractedRubric', () => {
  test('normalizes percentage weights and scoring scale fields', () => {
    const payload = ExtractedRubricSchema.parse({
      scoringScale: {
        type: 'weighted_1_5',
        minScore: 1,
        maxScore: 6,
      },
      rubric: {
        categories: [
          {
            label: 'Thesis',
            weight: 40,
            description: 'States a clear claim.',
          },
          {
            label: 'Evidence',
            weight: 60,
            description: 'Uses relevant support.',
          },
        ],
      },
    });

    const result = normalizeExtractedRubric(payload);

    expect(result.scoringScale).toEqual({
      type: 'weighted_1_5',
      minScore: 1,
      maxScore: 6,
      step: 1,
      compositeMin: undefined,
      compositeMax: undefined,
    });
    expect(result.rubric.categories).toHaveLength(2);
    expect(result.rubric.categories[0]).toEqual({
      key: 'thesis',
      label: 'Thesis',
      weight: 0.4,
      description: 'States a clear claim.',
    });
    expect(result.rubric.categories[1].weight).toBe(0.6);
  });
});
