import { describe, expect, test } from 'bun:test';
import { submissionHasGradeSignals } from './archive-non-canonical-submissions.helpers';

describe('submissionHasGradeSignals', () => {
  test('false when all empty', () => {
    expect(
      submissionHasGradeSignals({
        gradedAt: null,
        overallScore: null,
        numericPercentage: null,
        letterGrade: null,
        score: null,
        feedback: null,
      }),
    ).toBe(false);
  });

  test('true when gradedAt set', () => {
    expect(
      submissionHasGradeSignals({
        gradedAt: new Date(),
        overallScore: null,
        numericPercentage: null,
        letterGrade: null,
        score: null,
        feedback: null,
      }),
    ).toBe(true);
  });

  test('true when feedback text present', () => {
    expect(
      submissionHasGradeSignals({
        gradedAt: null,
        overallScore: null,
        numericPercentage: null,
        letterGrade: null,
        score: null,
        feedback: 'Nice work.',
      }),
    ).toBe(true);
  });
});
