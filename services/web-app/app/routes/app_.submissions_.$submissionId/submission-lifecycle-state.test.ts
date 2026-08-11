import { describe, expect, test } from 'bun:test';

import { resolveSubmissionLifecycleState } from './submission-lifecycle-state';

describe('resolveSubmissionLifecycleState', () => {
  test('is needs_grading when nothing has been graded or released', () => {
    expect(
      resolveSubmissionLifecycleState({
        isGraded: false,
        isReleased: false,
        hasGrade: false,
      })
    ).toBe('needs_grading');
  });

  test('is graded once a grade has been saved but not released', () => {
    expect(
      resolveSubmissionLifecycleState({
        isGraded: true,
        isReleased: false,
        hasGrade: true,
      })
    ).toBe('graded');
  });

  test('stays needs_grading when gradedAt is set without any recorded grade', () => {
    expect(
      resolveSubmissionLifecycleState({
        isGraded: true,
        isReleased: false,
        hasGrade: false,
      })
    ).toBe('needs_grading');
  });

  test('is graded on a points scale, which records raw points and no percentage', () => {
    expect(
      resolveSubmissionLifecycleState({
        isGraded: true,
        isReleased: false,
        hasGrade: true,
      })
    ).toBe('graded');
  });

  test('is released once the grade has been released', () => {
    expect(
      resolveSubmissionLifecycleState({
        isGraded: true,
        isReleased: true,
        hasGrade: true,
      })
    ).toBe('released');
  });

  test('treats a released submission as released even if graded is somehow false', () => {
    // Defensive: released implies graded in practice, but released should win.
    expect(
      resolveSubmissionLifecycleState({
        isGraded: false,
        isReleased: true,
        hasGrade: false,
      })
    ).toBe('released');
  });
});
