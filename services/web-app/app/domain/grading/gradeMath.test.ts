import { describe, expect, test } from 'bun:test';
import {
  computeWeightedBandPercentage,
  computeWeightedPercentage,
  computeWeightedPercentageForCategories,
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
    ).toBe('20 / 25');
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

describe('computeWeightedBandPercentage', () => {
  const categories = [
    { key: 'a', weight: 0.5 },
    { key: 'b', weight: 0.5 },
  ];

  test('weights the category percentages with nothing converted', () => {
    expect(
      computeWeightedBandPercentage(
        { a: { score: 92 }, b: { score: 84 } },
        categories
      )
    ).toBe(88);
  });

  /**
   * The reason banded scoring exists: on the 1-5 path a score of 4 in every
   * category could only ever produce 89, because each score was mapped to the
   * ceiling of its band before being averaged.
   */
  test('a mid-band score no longer snaps to the band ceiling', () => {
    expect(
      computeWeightedBandPercentage(
        { a: { score: 84 }, b: { score: 84 } },
        categories
      )
    ).toBe(84);
    expect(
      computeWeightedPercentageForCategories({ a: { score: 4 }, b: { score: 4 } }, [
        { key: 'a', label: 'A', weight: 0.5, description: '' },
        { key: 'b', label: 'B', weight: 0.5, description: '' },
      ])
    ).toBe(89);
  });

  test('an unscored category produces no grade rather than a partial one', () => {
    expect(
      computeWeightedBandPercentage({ a: { score: 92 } }, categories)
    ).toBeNull();
  });

  test('normalizes mixed raw-point category ranges before weighting', () => {
    const rawPointCategories = [
      {
        key: 'introduction',
        weight: 0.1,
        bands: [{ min: 0, max: 5, label: 'Full range', description: '' }],
      },
      {
        key: 'country_1',
        weight: 0.4,
        bands: [{ min: 0, max: 20, label: 'Full range', description: '' }],
      },
      {
        key: 'country_2',
        weight: 0.4,
        bands: [{ min: 0, max: 20, label: 'Full range', description: '' }],
      },
      {
        key: 'conclusion',
        weight: 0.1,
        bands: [{ min: 0, max: 5, label: 'Full range', description: '' }],
      },
    ];

    expect(
      computeWeightedBandPercentage(
        {
          introduction: { score: 5 },
          country_1: { score: 18 },
          country_2: { score: 16 },
          conclusion: { score: 4 },
        },
        rawPointCategories
      )
    ).toBe(86);
  });
});

// The assignment total is independent of the rubric's authored scoring scale.
describe('raw rubric points on configured assignments', () => {
  for (const [pointValue, expected] of [[10, '6 / 10'], [30, '18 / 30'], [90, '54 / 90'], [100, '60 / 100'], [1, '1 / 1']] as const) {
    test(`scales 18/30 to ${pointValue} without treating it as a percentage`, () => {
      expect(formatAssignmentGrade({ submitForGrade: true, numericPercentage: null, pointValue, score: '18/30' })).toBe(expected);
    });
  }
  test('preserves exact teacher points alongside rounded legacy percentages', () => {
    expect(formatAssignmentGrade({ submitForGrade: true, numericPercentage: 46, pointValue: 200, score: '91/200' })).toBe('91 / 200');
    expect(formatAssignmentGrade({ submitForGrade: true, numericPercentage: 89, pointValue: 200, score: '4/5' })).toBe('178 / 200');
  });
  test('preserves zero and nonnumeric grades', () => {
    expect(formatAssignmentGrade({ submitForGrade: true, numericPercentage: null, pointValue: 90, score: '0/30' })).toBe('0 / 90');
    expect(formatAssignmentGrade({ submitForGrade: true, numericPercentage: null, pointValue: 90, score: 'Complete' })).toBe('Complete');
    expect(formatAssignmentGrade({ submitForGrade: true, numericPercentage: null, pointValue: 90, score: null })).toBeNull();
  });
});
