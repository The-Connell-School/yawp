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
  hasGrade,
}: {
  lifecycleState: SubmissionLifecycleState;
  hasDraftToReplace: boolean;
  hasUnsavedChanges: boolean;
  /** An overall grade exists on this rubric's own scale -- see hasRecordedGrade. */
  hasGrade: boolean;
}) {
  if (lifecycleState === 'needs_grading') {
    return (hasDraftToReplace || hasUnsavedChanges) && hasGrade;
  }
  if (lifecycleState === 'graded') {
    return hasUnsavedChanges;
  }
  return false;
}
