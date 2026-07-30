import { type SubmissionLifecycleState } from './submission-lifecycle-state';

/**
 * Resolves whether the teacher-grading branch of the submission page should
 * render the editable grading form (true) or the read-only summary (false).
 *
 * - needs_grading: always editable — there's nothing to view yet.
 * - graded: defaults to read-only; ?edit=1 explicitly enters edit mode.
 * - released: always locked to read-only, regardless of ?edit — the
 *   lifecycle is terminal and cannot be re-opened for editing.
 */
export function resolveSubmissionGradeMode({
  isGradingOther,
  editParam,
  lifecycleState,
}: {
  isGradingOther: boolean;
  editParam: string | null;
  lifecycleState: SubmissionLifecycleState;
}) {
  if (!isGradingOther) return false;
  if (lifecycleState === 'released') return false;
  if (lifecycleState === 'needs_grading') return true;
  return editParam === '1';
}
