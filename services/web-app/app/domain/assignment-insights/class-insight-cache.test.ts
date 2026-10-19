import { describe, expect, test } from 'bun:test';
import {
  classInsightFingerprint,
  isClassInsightCurrent,
} from './class-insight-cache';

const input = [
  {
    submissionId: 's1',
    score: '30/30',
    overallScore: 30,
    releasedAt: '2026-10-18',
  },
];
describe('class summary grade cache', () => {
  test('invalidates old input versions, grade edits, releases, and category edits', () => {
    const fingerprint = classInsightFingerprint(input);
    const summary = { inputVersion: 2, gradeFingerprint: fingerprint };
    expect(isClassInsightCurrent({ overview: 'legacy' }, fingerprint)).toBe(
      false
    );
    expect(isClassInsightCurrent(summary, fingerprint)).toBe(true);
    for (const change of [
      { score: '0/30', overallScore: 0 },
      { releasedAt: '2026-10-19' },
      { rubricScores: { engagement: 5 } },
    ]) {
      expect(
        isClassInsightCurrent(
          summary,
          classInsightFingerprint([{ ...input[0], ...change }])
        )
      ).toBe(false);
    }
    expect(isClassInsightCurrent(summary, classInsightFingerprint([]))).toBe(
      false
    );
  });
  test('row and object-key ordering do not invalidate the cache', () => {
    const other = { submissionId: 's2', rubricScores: { b: 2, a: 3 } };
    expect(classInsightFingerprint([...input, other])).toBe(
      classInsightFingerprint([
        { rubricScores: { a: 3, b: 2 }, submissionId: 's2' },
        ...input,
      ])
    );
  });
});
