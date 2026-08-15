import { describe, expect, test } from 'bun:test';
import {
  computeWeightedPercentage,
  formatAssignmentGrade,
  formatPointGrade,
  pointsScaleGradeFields,
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

describe('pointsScaleGradeFields', () => {
  test('reports the earned points out of the top of the scale', () => {
    expect(
      pointsScaleGradeFields({ categories: [{ score: 2 }], maxScore: 3 })
    ).toEqual({
      overallScore: 2,
      numericPercentage: null,
      letterGrade: null,
      score: '2/3',
    });
  });

  test('reports a top score', () => {
    expect(
      pointsScaleGradeFields({ categories: [{ score: 3 }], maxScore: 3 })
    ).toMatchObject({ overallScore: 3, score: '3/3' });
  });

  test('reports a zero score as earned points, not as a missing grade', () => {
    expect(
      pointsScaleGradeFields({ categories: [{ score: 0 }], maxScore: 3 })
    ).toMatchObject({ overallScore: 0, score: '0/3' });
  });

  test('never invents a percentage or a letter for a points scale', () => {
    const fields = pointsScaleGradeFields({
      categories: [{ score: 3 }],
      maxScore: 3,
    });

    expect(fields.numericPercentage).toBeNull();
    expect(fields.letterGrade).toBeNull();
  });

  test('averages and rounds across several categories', () => {
    expect(
      pointsScaleGradeFields({
        categories: [{ score: 3 }, { score: 2 }],
        maxScore: 3,
      })
    ).toMatchObject({ overallScore: 3, score: '3/3' });
  });

  test('clamps a score that landed outside the scale', () => {
    expect(
      pointsScaleGradeFields({ categories: [{ score: 9 }], maxScore: 3 })
    ).toMatchObject({ overallScore: 3, score: '3/3' });
    expect(
      pointsScaleGradeFields({ categories: [{ score: -4 }], maxScore: 3 })
    ).toMatchObject({ overallScore: 0, score: '0/3' });
  });
});
