export type SubmissionLifecycleState = 'needs_grading' | 'graded' | 'released';

/**
 * Derives the teacher-facing lifecycle state of a submission from its
 * grading flags. This is a one-way state machine: needs_grading -> graded ->
 * released. There is no path backward.
 */
export function resolveSubmissionLifecycleState({
  isGraded,
  isReleased,
}: {
  isGraded: boolean;
  isReleased: boolean;
}): SubmissionLifecycleState {
  if (isReleased) return 'released';
  if (isGraded) return 'graded';
  return 'needs_grading';
}
