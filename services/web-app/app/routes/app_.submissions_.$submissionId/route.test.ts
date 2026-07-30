import { describe, expect, test } from 'bun:test';

import { resolveSubmissionGradeMode } from './submission-grade-mode';

describe('submission grade mode', () => {
  test('does not allow edit mode when not grading another user', () => {
    expect(
      resolveSubmissionGradeMode({
        isGradingOther: false,
        editParam: '1',
        lifecycleState: 'graded',
      })
    ).toBe(false);
  });

  describe('needs_grading', () => {
    test('is always edit mode, regardless of edit param', () => {
      expect(
        resolveSubmissionGradeMode({
          isGradingOther: true,
          editParam: null,
          lifecycleState: 'needs_grading',
        })
      ).toBe(true);
      expect(
        resolveSubmissionGradeMode({
          isGradingOther: true,
          editParam: '0',
          lifecycleState: 'needs_grading',
        })
      ).toBe(true);
    });
  });

  describe('graded', () => {
    test('defaults to view mode when no edit param is present', () => {
      expect(
        resolveSubmissionGradeMode({
          isGradingOther: true,
          editParam: null,
          lifecycleState: 'graded',
        })
      ).toBe(false);
    });

    test('enters edit mode when edit=1 is explicitly set', () => {
      expect(
        resolveSubmissionGradeMode({
          isGradingOther: true,
          editParam: '1',
          lifecycleState: 'graded',
        })
      ).toBe(true);
    });

    test('stays in view mode when edit=0 is explicitly set', () => {
      expect(
        resolveSubmissionGradeMode({
          isGradingOther: true,
          editParam: '0',
          lifecycleState: 'graded',
        })
      ).toBe(false);
    });
  });

  describe('released', () => {
    test('is always locked to view mode, even with edit=1', () => {
      expect(
        resolveSubmissionGradeMode({
          isGradingOther: true,
          editParam: '1',
          lifecycleState: 'released',
        })
      ).toBe(false);
    });

    test('is locked to view mode with no edit param', () => {
      expect(
        resolveSubmissionGradeMode({
          isGradingOther: true,
          editParam: null,
          lifecycleState: 'released',
        })
      ).toBe(false);
    });
  });
});
