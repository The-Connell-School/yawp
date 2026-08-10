import { describe, expect, test } from 'bun:test';
import {
  ExtractedRubricSchema,
  normalizeExtractedRubric,
} from './rubric-extract.server';

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
