import { describe, expect, test } from 'bun:test';
import { computeWeightedPercentage } from './gradeMath';

describe('computeWeightedPercentage', () => {
  test('uses the updated 25/25/20/20/10 rubric weighting', () => {
    const percent = computeWeightedPercentage({
      thesis_and_content: { score: 5, comment: 'Strong thesis.' },
      organization_and_structure: { score: 1, comment: 'Weak organization.' },
      evidence_and_support: { score: 5, comment: 'Strong evidence.' },
      voice_and_style: { score: 1, comment: 'Flat voice.' },
      grammar_and_mechanics: { score: 1, comment: 'Frequent errors.' },
    });

    expect(percent).toBe(77);
  });
});
