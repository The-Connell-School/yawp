export type SubmissionLifecycleState = 'needs_grading' | 'graded' | 'released';

/**
 * Derives the teacher-facing lifecycle state of a submission from its
 * grading flags. This is a one-way state machine: needs_grading -> graded ->
 * released. There is no path backward.
 */
export function resolveSubmissionLifecycleState({
  isGraded,
  isReleased,
  hasNumericGrade,
}: {
  isGraded: boolean;
  isReleased: boolean;
  hasNumericGrade: boolean;
}): SubmissionLifecycleState {
  if (isReleased) return 'released';
  if (isGraded && hasNumericGrade) return 'graded';
  return 'needs_grading';
}
