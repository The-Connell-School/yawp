import { describe, expect, test } from 'bun:test';
import {
  computeWeightedPercentage,
  formatAssignmentGrade,
  formatPointGrade,
} from './gradeMath';

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

describe('formatPointGrade', () => {
  test('converts native percentages to configured assignment points', () => {
    expect(formatPointGrade(89, 25)).toBe('22 / 25');
    expect(formatPointGrade(100, 5)).toBe('5 / 5');
  });

  test('returns null without a percentage or valid point value', () => {
    expect(formatPointGrade(null, 25)).toBeNull();
    expect(formatPointGrade(80, null)).toBeNull();
    expect(formatPointGrade(80, 0)).toBeNull();
  });
});

describe('formatAssignmentGrade', () => {
  test('returns null for assignments that are not submitted for grade', () => {
    expect(
      formatAssignmentGrade({
        submitForGrade: false,
        numericPercentage: 89,
        letterGrade: 'B',
        pointValue: 25,
        score: '4/5',
      })
    ).toBeNull();
  });

  test('prefers point display and falls back to existing grade strings', () => {
    expect(
      formatAssignmentGrade({
        submitForGrade: true,
        numericPercentage: 89,
        letterGrade: 'B',
        pointValue: 25,
        score: '4/5',
      })
    ).toBe('22 / 25');
    expect(
      formatAssignmentGrade({
        submitForGrade: true,
        numericPercentage: 89,
        letterGrade: 'B',
        pointValue: null,
        score: '4/5',
      })
    ).toBe('89% (B)');
    expect(
      formatAssignmentGrade({
        submitForGrade: true,
        numericPercentage: null,
        letterGrade: null,
        pointValue: 25,
        score: '4/5',
      })
    ).toBe('4/5');
  });
});
