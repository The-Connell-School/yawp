import { describe, expect, test } from 'bun:test';

import { resolveSubmissionGradeMode } from './submission-grade-mode';

describe('submission grade mode', () => {
  test('does not allow edit mode when not grading another user', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: false,
        lifecycleState: 'graded',
        isEditingGrade: true,
      })
    ).toBe(false);
  });

  test('is always edit mode while needs grading', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        lifecycleState: 'needs_grading',
        isEditingGrade: false,
      })
    ).toBe(true);
  });

  test('is edit mode for graded submissions only while editing', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        lifecycleState: 'graded',
        isEditingGrade: false,
      })
    ).toBe(false);
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        lifecycleState: 'graded',
        isEditingGrade: true,
      })
    ).toBe(true);
  });

  test('keeps released grades read-only until the organization rollout is enabled', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        lifecycleState: 'released',
        isEditingGrade: true,
        submissionActivityEnabled: false,
      })
    ).toBe(false);
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        lifecycleState: 'released',
        isEditingGrade: true,
        submissionActivityEnabled: true,
      })
    ).toBe(true);
  });
});
