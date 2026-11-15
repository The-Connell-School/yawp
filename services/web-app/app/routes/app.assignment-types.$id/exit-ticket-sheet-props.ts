import type { ExitTicketPrefill } from '~/domain/lesson-planner/exit-ticket-block';

/**
 * The creation sheet's starting answers for a ticket the Lesson Planner
 * handed over. Shared by the assignment type page and its tests, so the
 * hand-off a test opens is the one a teacher opens.
 */
export function exitTicketSheetPropsFromPrefill(
  planned: ExitTicketPrefill | null
) {
  return {
    initialExitTicketMode: planned?.mode,
    initialExitTicketFocus: planned?.focus ?? undefined,
    initialExitTicketTopic: planned?.topic,
    initialExitTicketAnswerType: planned?.answerType ?? null,
    initialExitTicketLessonNotes: planned?.lessonNotes ?? null,
    initialExitTicketReflectionPrompt: planned?.reflectionPrompt ?? null,
    initialExitTicketGrading: planned?.grading ?? null,
    initialExitTicketConfig: planned?.config ?? null,
    initialExitTicketGradebook: planned
      ? { submitForGrade: planned.graded, pointValue: planned.pointValue }
      : null,
  };
}
