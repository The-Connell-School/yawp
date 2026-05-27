import { describe, expect, test } from 'bun:test';
import {
  computeApTotal,
  computeApTotalFromRecord,
  apScoreDisplay,
  type ApRubricScores,
} from './ap-grade-math';

describe('computeApTotal', () => {
  test('sums all three rows', () => {
    const scores: ApRubricScores = {
      thesis: 1,
      evidence_commentary: 4,
      sophistication: 1,
    };
    expect(computeApTotal(scores)).toBe(6);
  });

  test('returns 0 when all rows are 0', () => {
    const scores: ApRubricScores = {
      thesis: 0,
      evidence_commentary: 0,
      sophistication: 0,
    };
    expect(computeApTotal(scores)).toBe(0);
  });

  test('handles partial scores', () => {
    const scores: ApRubricScores = {
      thesis: 1,
      evidence_commentary: 2,
      sophistication: 0,
    };
    expect(computeApTotal(scores)).toBe(3);
  });
});

describe('apScoreDisplay', () => {
  test('formats as total/6', () => {
    expect(apScoreDisplay(4)).toBe('4/6');
  });
});

describe('computeApTotalFromRecord', () => {
  test('computes total from a rubricScores record', () => {
    const record = {
      thesis: { score: 1, comment: 'Good thesis.' },
      evidence_commentary: { score: 3, comment: 'Solid evidence.' },
      sophistication: { score: 1, comment: 'Nuanced.' },
    };
    expect(computeApTotalFromRecord(record)).toBe(5);
  });

  test('returns null for missing rows', () => {
    expect(
      computeApTotalFromRecord({
        thesis: { score: 1 },
      })
    ).toBeNull();
  });

  test('returns null for out-of-range scores', () => {
    expect(
      computeApTotalFromRecord({
        thesis: { score: 2 },
        evidence_commentary: { score: 3 },
        sophistication: { score: 1 },
      })
    ).toBeNull();
  });

  test('returns null for null input', () => {
    expect(computeApTotalFromRecord(null)).toBeNull();
  });

  test('standard rubric scores return null (different shape)', () => {
    expect(
      computeApTotalFromRecord({
        thesis_and_content: { score: 5 },
        organization_and_structure: { score: 4 },
        evidence_and_support: { score: 3 },
        voice_and_style: { score: 3 },
        grammar_and_mechanics: { score: 4 },
      })
    ).toBeNull();
  });
});
