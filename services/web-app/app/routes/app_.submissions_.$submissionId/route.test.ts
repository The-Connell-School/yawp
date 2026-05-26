import { describe, expect, test } from 'bun:test';

import { resolveSubmissionGradeMode } from './submission-grade-mode';

describe('submission grade mode', () => {
  test('does not allow direct edit mode when document submission grading is disabled', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        isDocumentSubmissionEnabled: false,
        editParam: '1',
        loaderGradeMode: true,
      })
    ).toBe(false);
  });

  test('allows explicit edit mode for a grading teacher when document submission grading is enabled', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: true,
        isDocumentSubmissionEnabled: true,
        editParam: '1',
        loaderGradeMode: false,
      })
    ).toBe(true);
  });
});
