import { type SubmissionLifecycleState } from '../submission-lifecycle-state';

export type PrimaryGradingAction = 'save' | 'release' | null;

export function resolvePrimaryGradingAction(
  lifecycleState: SubmissionLifecycleState
): PrimaryGradingAction {
  if (lifecycleState === 'released') return null;
  if (lifecycleState === 'graded') return 'release';
  if (lifecycleState === 'needs_grading') return 'save';
  return null;
}

export function canSaveGradingDraft({
  lifecycleState,
  hasDraftToReplace,
  hasUnsavedChanges,
  hasNumericPercentage,
}: {
  lifecycleState: SubmissionLifecycleState;
  hasDraftToReplace: boolean;
  hasUnsavedChanges: boolean;
  hasNumericPercentage: boolean;
}) {
  if (lifecycleState === 'needs_grading') {
    return (hasDraftToReplace || hasUnsavedChanges) && hasNumericPercentage;
  }
  if (lifecycleState === 'graded') {
    return hasUnsavedChanges;
  }
  return false;
}
