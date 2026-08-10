import { describe, expect, test } from 'bun:test';
import {
  hasRecordedGrade,
  rubricScaleGradeFields,
  rubricScaleGradeFieldsFromScores,
} from './recorded-grade';

describe('hasRecordedGrade', () => {
  test('an ungraded submission has no recorded grade', () => {
    expect(
      hasRecordedGrade({
        numericPercentage: null,
        overallScore: null,
        score: null,
      })
    ).toBe(false);
  });

  test('a percentage scale records its grade as a percentage', () => {
    expect(hasRecordedGrade({ numericPercentage: 84 })).toBe(true);
  });

  test('a points scale records its grade without any percentage', () => {
    // Daily Pages: "2/3" and overallScore 2, numericPercentage deliberately
    // null. This is the case every `numericPercentage != null` check missed.
    expect(
      hasRecordedGrade({
        numericPercentage: null,
        overallScore: 2,
        score: '2/3',
      })
    ).toBe(true);
  });

  test('a zero overall score is a recorded grade, not a blank', () => {
    expect(
      hasRecordedGrade({ numericPercentage: null, overallScore: 0, score: '0/3' })
    ).toBe(true);
  });

  test('a zero percentage is a recorded grade, not a blank', () => {
    expect(hasRecordedGrade({ numericPercentage: 0 })).toBe(true);
  });

  test('an empty score string is not a recorded grade', () => {
    expect(hasRecordedGrade({ score: '   ' })).toBe(false);
  });
});

describe('rubricScaleGradeFields', () => {
  test('reports raw points on the points scale', () => {
    expect(
      rubricScaleGradeFields({
        categories: [{ score: 3 }],
        scoringType: 'points_scale',
        maxScore: 3,
      })
    ).toMatchObject({
      overallScore: 3,
      score: '3/3',
      numericPercentage: null,
      letterGrade: null,
    });
  });

  // The admin editor's "Rubric points" option writes `rubric_points` while
  // Daily Pages writes `points_scale`. Only the latter used to be recognised,
  // so a rubric configured through the editor recorded no overall grade.
  test('treats the editor\'s rubric_points as the same raw-points scale', () => {
    expect(
      rubricScaleGradeFields({
        categories: [{ score: 2 }, { score: 3 }],
        scoringType: 'rubric_points',
        maxScore: 3,
      })
    ).toMatchObject({
      overallScore: 3,
      score: '3/3',
      numericPercentage: null,
      letterGrade: null,
    });
  });

  test('reports an ACT composite on the ACT scale', () => {
    expect(
      rubricScaleGradeFields({
        categories: [{ score: 4 }, { score: 5 }],
        scoringType: 'act_writing_2_12',
        maxScore: 6,
      })
    ).toMatchObject({ overallScore: 9, score: '9/12' });
  });

  test('leaves percentage scales to the weighted percentage', () => {
    expect(
      rubricScaleGradeFields({
        categories: [{ score: 4 }],
        scoringType: 'weighted_1_5',
        maxScore: 5,
      })
    ).toBeNull();
  });

  test('produces nothing from no categories', () => {
    expect(
      rubricScaleGradeFields({
        categories: [],
        scoringType: 'points_scale',
        maxScore: 3,
      })
    ).toBeNull();
  });
});

describe('rubricScaleGradeFieldsFromScores', () => {
  const dailyPages = {
    categories: [{ key: 'engagement', label: 'Engagement', description: '', weight: 1 }],
    minScore: 0,
    maxScore: 3,
    scoringType: 'points_scale',
  };

  test("a teacher's own score becomes the recorded grade", () => {
    expect(
      rubricScaleGradeFieldsFromScores({
        ...dailyPages,
        rubricScores: { engagement: { score: 1, comment: '' } },
      })
    ).toMatchObject({ overallScore: 1, score: '1/3' });
  });

  test('Absent is a real score of zero, not a blank', () => {
    expect(
      rubricScaleGradeFieldsFromScores({
        ...dailyPages,
        rubricScores: { engagement: { score: 0, comment: '' } },
      })
    ).toMatchObject({ overallScore: 0, score: '0/3' });
  });

  test('an unscored category produces no grade at all', () => {
    // -1 is the not-yet-scored sentinel on a 0-floor scale.
    expect(
      rubricScaleGradeFieldsFromScores({
        ...dailyPages,
        rubricScores: { engagement: { score: -1, comment: '' } },
      })
    ).toBeNull();
  });

  test('a partly scored rubric produces no grade', () => {
    expect(
      rubricScaleGradeFieldsFromScores({
        categories: [
          { key: 'a', label: 'A', description: '', weight: 1 },
          { key: 'b', label: 'B', description: '', weight: 1 },
        ],
        minScore: 1,
        maxScore: 6,
        scoringType: 'act_writing_2_12',
        rubricScores: { a: { score: 4, comment: '' } },
      })
    ).toBeNull();
  });
});
