import { type SubmissionLifecycleState } from './submission-lifecycle-state';

/**
 * Resolves whether the teacher can interact with grading controls in the essay
 * (e.g. remove grammar marks). Editing is limited to active grading sessions.
 */
export function resolveSubmissionGradeMode({
  isGradingOther,
  lifecycleState,
  isEditingGrade,
  submissionActivityEnabled = false,
}: {
  isGradingOther: boolean;
  lifecycleState: SubmissionLifecycleState;
  isEditingGrade: boolean;
  submissionActivityEnabled?: boolean;
}) {
  if (!isGradingOther) return false;
  if (lifecycleState === 'released') {
    return submissionActivityEnabled && isEditingGrade;
  }
  if (lifecycleState === 'needs_grading') return true;
  if (lifecycleState === 'graded') return isEditingGrade;
  return false;
}
