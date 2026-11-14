import { exitTicketActivityKind } from './exit-ticket-activities';
import type { ExitTicketConfig } from './exit-ticket';

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * What the tutor is told about a v3 exit ticket, beside its title and prompt:
 * the correct answer the teacher described and the note they left for Yawp!.
 * Both are optional, and neither depends on grading. Null when there is
 * nothing to add, and for tickets from before v3, which read as they did.
 */
export function buildExitTicketTutorContext(
  config: ExitTicketConfig | null | undefined
): string | null {
  if (!config?.activity) return null;
  const notes = config.lessonNotes;
  const isCheck = exitTicketActivityKind(config.activity) === 'check';
  const answer =
    isCheck && config.mode === 'specific' && config.answerType === 'objective'
      ? notes?.mustMention.trim()
      : '';
  const note = notes?.mainPoints.trim() ?? '';
  if (!answer && !note) return null;

  return [
    'The teacher wrote these for you about this exit ticket. The student cannot see them. Use them so your feedback is accurate. Never tell the student the answer or write it for them.',
    '<exit_ticket_teacher_notes>',
    answer ? `<correct_answer>${escapeText(answer)}</correct_answer>` : null,
    note ? `<teacher_note>${escapeText(note)}</teacher_note>` : null,
    '</exit_ticket_teacher_notes>',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
