export type SubmissionLifecycleState = 'needs_grading' | 'graded' | 'released';

/**
 * Derives the teacher-facing lifecycle state of a submission from its
 * grading flags. This is a one-way state machine: needs_grading -> graded ->
 * released. There is no path backward.
 */
export function resolveSubmissionLifecycleState({
  isGraded,
  isReleased,
  hasGrade,
}: {
  isGraded: boolean;
  isReleased: boolean;
  /**
   * Whether an overall grade has been recorded, on whatever scale this rubric
   * uses. A points scale records raw points and no percentage, so asking for a
   * percentage here left every Daily Pages submission stuck in needs_grading
   * and hid the Release Grade button.
   */
  hasGrade: boolean;
}): SubmissionLifecycleState {
  if (isReleased) return 'released';
  if (isGraded && hasGrade) return 'graded';
  return 'needs_grading';
}
