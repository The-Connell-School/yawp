import { describe, expect, test } from 'bun:test';

import { resolveSubmissionGradeMode } from './submission-grade-mode';

describe('submission grade mode', () => {
  test('allows explicit edit mode for a grading teacher', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        editParam: '1',
        loaderGradeMode: false,
      })
    ).toBe(true);
  });

  test('falls back to loader grade mode when edit param is absent', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        editParam: null,
        loaderGradeMode: true,
      })
    ).toBe(true);
  });

  test('does not allow edit mode when not grading another user', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: false,
        editParam: '1',
        loaderGradeMode: true,
      })
    ).toBe(false);
  });
});
