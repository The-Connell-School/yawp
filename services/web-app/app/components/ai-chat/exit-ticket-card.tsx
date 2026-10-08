/**
 * The lesson's check for understanding, with a way to actually assign it.
 *
 * An exit ticket written into a plan is a page a teacher has to make. An exit
 * ticket in Yawp is an assignment students answer and a set of responses that
 * come back read — so the prompt is shown exactly as students will get it, and
 * the button underneath opens the creation sheet on the answers the lesson
 * already decided: what is being checked, what today covered, and the mix-up
 * to watch for.
 */
import { Link } from 'react-router';
import { Check, ClipboardCheck, Plus, Sparkles } from 'lucide-react';
import { cn } from '~/utils/misc';
import {
  exitTicketCreateHref,
  type PlannedExitTicket,
} from '~/domain/lesson-planner/exit-ticket-block';
import {
  EXIT_TICKET_GRADING_BASIS_OPTIONS,
  EXIT_TICKET_LESSON_NOTE_FIELDS,
  exitTicketFocusOption,
  exitTicketReflectionPromptId,
  exitTicketReflectionPromptOption,
} from '~/domain/assignment-types/exit-ticket';

export function ExitTicketCard({
  ticket,
  assignmentTypeId,
  conversationId,
  added = false,
  onToggle,
  disabled,
}: {
  ticket: PlannedExitTicket;
  /**
   * Null when this org has no Exit Ticket type — then it is still the ticket,
   * just without a button into a page the teacher cannot open.
   */
  assignmentTypeId: string | null;
  /** Travels with the teacher so they can get back to this lesson. */
  conversationId?: string | null;
  added?: boolean;
  onToggle?: ((added: boolean) => void) | null;
  disabled?: boolean;
}) {
  const { config } = ticket;
  const focus =
    config.mode === 'specific' ? exitTicketFocusOption(config.focus) : null;
  // What kind of ticket this is, in the words the form will use.
  const kindLabel = focus
    ? focus.label
    : `Reflection · ${
        exitTicketReflectionPromptOption(exitTicketReflectionPromptId(config))
          ?.label ?? 'What I learned'
      }`;
  const basisLabel = EXIT_TICKET_GRADING_BASIS_OPTIONS.find(
    (option) => option.value === config.grading?.basis
  )?.label;
  const gradingLabel = ticket.graded
    ? [
        'Graded',
        ticket.pointValue ? `${ticket.pointValue} points` : null,
        config.mode === 'basic' && basisLabel ? basisLabel.toLowerCase() : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Ungraded — feedback only';
  const notes = config.lessonNotes;
  const filledNotes = notes
    ? EXIT_TICKET_LESSON_NOTE_FIELDS.filter(
        (field) => notes[field.key].trim().length > 0
      )
    : [];

  return (
    <div
      data-testid="exit-ticket-card"
      className="mt-3 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.03]"
    >
      <div className="flex items-center gap-2 border-b border-primary/15 px-4 py-2.5">
        <ClipboardCheck size={15} className="shrink-0 text-primary" />
        <span className="text-sm font-medium">Exit ticket</span>
        <span className="text-sm text-muted-foreground">{kindLabel}</span>
        <span
          data-testid="exit-ticket-grading"
          className="ml-auto text-xs text-muted-foreground"
        >
          {gradingLabel}
        </span>
      </div>

      <blockquote className="whitespace-pre-wrap border-l-2 border-primary/40 px-4 py-3.5 text-sm leading-relaxed text-foreground/90">
        {ticket.prompt}
      </blockquote>

      {/* What the teacher told the planner about the lesson, shown because it
          is what the responses get read against — and because a teacher should
          see what is about to be filled in on their behalf. Students never see
          any of it. */}
      {filledNotes.length > 0 ? (
        <dl className="space-y-1.5 border-t border-primary/15 px-4 py-3 text-xs">
          {filledNotes.map((field) => (
            <div key={field.key} className="flex gap-2">
              <dt className="shrink-0 font-medium text-muted-foreground">
                {field.label}:
              </dt>
              <dd className="min-w-0 text-foreground/80">
                {notes![field.key]}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-primary/15 bg-primary/[0.04] px-4 py-2.5">
        {onToggle ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(!added)}
            data-testid="exit-ticket-stack-toggle"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50',
              added
                ? 'bg-primary/10 text-primary hover:bg-primary/15'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            )}
          >
            {added ? <Check size={14} /> : <Plus size={14} />}
            {added ? 'In the stack' : 'Add to stack'}
          </button>
        ) : null}
        {assignmentTypeId ? (
          <Link
            to={exitTicketCreateHref(assignmentTypeId, ticket, conversationId)}
            data-testid="exit-ticket-create"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/5"
          >
            <Sparkles size={13} />
            Create this exit ticket for your class
          </Link>
        ) : null}
      </div>
    </div>
  );
}
