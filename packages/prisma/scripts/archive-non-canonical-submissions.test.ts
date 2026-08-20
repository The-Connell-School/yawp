import { describe, expect, test } from 'bun:test';
import {
  durableActivityExclusionSql,
  submissionHasGradeSignals,
} from './archive-non-canonical-submissions.helpers';

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
      })
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
      })
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
      })
    ).toBe(true);
  });
});

test('durable activity prevents operational cleanup from deleting a submission', () => {
  expect(durableActivityExclusionSql('candidate')).toContain(
    'sa."submissionId" = candidate.id'
  );
});
