import { describe, expect, it } from 'bun:test';
import {
  canSaveGradingDraft,
  resolvePrimaryGradingAction,
} from './resolve-primary-grading-action';

describe('resolvePrimaryGradingAction', () => {
  it('returns save for needs grading', () => {
    expect(resolvePrimaryGradingAction('needs_grading')).toBe('save');
  });

  it('returns release for graded submissions', () => {
    expect(resolvePrimaryGradingAction('graded')).toBe('release');
  });

  it('returns nothing once released', () => {
    expect(resolvePrimaryGradingAction('released')).toBe(null);
  });
});

describe('canSaveGradingDraft', () => {
  it('is false for an empty needs-grading submission', () => {
    expect(
      canSaveGradingDraft({
        lifecycleState: 'needs_grading',
        hasDraftToReplace: false,
        hasUnsavedChanges: false,
        hasNumericPercentage: false,
      })
    ).toBe(false);
  });

  it('is false when draft content exists but overall percentage is missing', () => {
    expect(
      canSaveGradingDraft({
        lifecycleState: 'needs_grading',
        hasDraftToReplace: true,
        hasUnsavedChanges: false,
        hasNumericPercentage: false,
      })
    ).toBe(false);
  });

  it('is true once needs-grading content and overall percentage exist', () => {
    expect(
      canSaveGradingDraft({
        lifecycleState: 'needs_grading',
        hasDraftToReplace: true,
        hasUnsavedChanges: false,
        hasNumericPercentage: true,
      })
    ).toBe(true);
  });

  it('is false for unsaved edits while grading without overall percentage', () => {
    expect(
      canSaveGradingDraft({
        lifecycleState: 'needs_grading',
        hasDraftToReplace: false,
        hasUnsavedChanges: true,
        hasNumericPercentage: false,
      })
    ).toBe(false);
  });

  it('is true only when a graded submission has unsaved edits', () => {
    expect(
      canSaveGradingDraft({
        lifecycleState: 'graded',
        hasDraftToReplace: true,
        hasUnsavedChanges: false,
        hasNumericPercentage: true,
      })
    ).toBe(false);
    expect(
      canSaveGradingDraft({
        lifecycleState: 'graded',
        hasDraftToReplace: true,
        hasUnsavedChanges: true,
        hasNumericPercentage: true,
      })
    ).toBe(true);
  });
});
