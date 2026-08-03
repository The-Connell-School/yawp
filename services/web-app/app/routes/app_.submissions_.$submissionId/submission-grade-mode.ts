import { type SubmissionLifecycleState } from './submission-lifecycle-state';

/**
 * Resolves whether the teacher can interact with grading controls in the essay
 * (e.g. remove grammar marks). Editing is limited to active grading sessions.
 */
export function resolveSubmissionGradeMode({
  isGradingOther,
  lifecycleState,
  isEditingGrade,
}: {
  isGradingOther: boolean;
  lifecycleState: SubmissionLifecycleState;
  isEditingGrade: boolean;
}) {
  if (!isGradingOther) return false;
  if (lifecycleState === 'released') return false;
  if (lifecycleState === 'needs_grading') return true;
  if (lifecycleState === 'graded') return isEditingGrade;
  return false;
}
