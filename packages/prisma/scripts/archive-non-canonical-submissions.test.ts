import { describe, expect, test } from 'bun:test';
import {
  deleteSubmissionsAndRedirects,
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

test('cleanup removes redirects only for submissions the database deleted', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    async query(sql: string, values: unknown[]) {
      calls.push({ sql, values });
      if (calls.length === 1) {
        return { rows: [{ id: 'deleted' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  expect(
    await deleteSubmissionsAndRedirects(client, ['deleted', 'retained'])
  ).toBe(1);
  expect(calls[0].sql).toContain('NOT EXISTS');
  expect(calls[0].sql).toContain('RETURNING id');
  expect(calls[0].values).toEqual([['deleted', 'retained']]);
  expect(calls[1].values).toEqual([['deleted']]);
});

test('durable activity prevents operational cleanup from deleting a submission', () => {
  expect(durableActivityExclusionSql('candidate')).toContain(
    'sa."submissionId" = candidate.id'
  );
});
