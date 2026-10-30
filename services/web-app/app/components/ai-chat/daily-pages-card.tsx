/**
 * A short writing exercise the planner offered, with a way to actually assign
 * it.
 *
 * The prompt used to arrive as a blockquote with a sentence explaining that it
 * was not from the library. A teacher does not need the provenance; they need
 * the exercise in front of their class tomorrow. So the prompt is shown as
 * students would read it, and the button underneath opens the right assignment
 * sheet with it already filled in.
 *
 * Right is the operative word. Yawp has two of these and they are graded
 * differently: a Class Starter is marked on engagement alone, a Daily Pages
 * entry on depth and clarity as well. Filing a three-minute starter as Daily
 * Pages marks a kid down for reflection nobody asked them for, so the card
 * says which one it is and sends it where it belongs.
 */
import { Link } from 'react-router';
import { CreatedInYawp } from '~/components/lesson-planner/created-in-yawp';
import { withPiece } from '~/domain/lesson-planner/stack-create-link';
import { Check, PenLine, Plus, Repeat } from 'lucide-react';
import { cn } from '~/utils/misc';
import {
  dailyPagesCreateHref,
  WRITING_EXERCISE_LABELS,
  type DailyPagesExercise,
} from '~/domain/lesson-planner/daily-pages-block';

export function DailyPagesCard({
  exercise,
  assignmentTypeId,
  classStarterTypeId = null,
  conversationId,
  added = false,
  onToggle,
  onReplace,
  disabled = false,
  created = null,
  materialId = null,
}: {
  exercise: DailyPagesExercise;
  /** Null when this org does not have Daily Pages — then it is just a prompt. */
  assignmentTypeId: string | null;
  /**
   * Null for the many orgs that never made a Class Starter type. A starter
   * then falls back to Daily Pages, and the button says so rather than
   * pretending it is creating something else.
   */
  classStarterTypeId?: string | null;
  /** Travels with the teacher so they can get back to this lesson. */
  conversationId?: string | null;
  /** Whether this prompt is already in the lesson's stack. */
  added?: boolean;
  /**
   * Files or removes this one prompt (Brian's review, B1): a teacher may want
   * the opener and not the exit ticket, so each piece gets its own choice.
   * Absent: no stack button, as before.
   */
  onToggle?: (added: boolean) => void;
  /**
   * Set on the options a swap offered (Brian's run 2, E1): put this one in
   * the stack in place of the class starter already there.
   */
  onReplace?: (() => void) | null;
  disabled?: boolean;
  /** Created in Yawp! from this piece of the stack (Brian's run 3, item 4). */
  created?: { href: string } | null;
  /** The stack piece this card is, so creating it can be remembered. */
  materialId?: string | null;
}) {
  const isStarter = exercise.kind === 'class-starter';
  const targetTypeId =
    (isStarter ? classStarterTypeId : null) ?? assignmentTypeId;
  // What the button will actually create, which is not always what the
  // planner offered.
  const targetLabel =
    isStarter && classStarterTypeId
      ? WRITING_EXERCISE_LABELS['class-starter']
      : WRITING_EXERCISE_LABELS['daily-pages'];

  return (
    <div
      data-testid="daily-pages-card"
      data-exercise-kind={exercise.kind}
      className="mt-3 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.03]"
    >
      <div className="flex items-center gap-2 border-b border-primary/15 px-4 py-2.5">
        <PenLine size={15} className="shrink-0 text-primary" />
        <span className="text-sm font-medium">
          {/* Never "warm-up" for Daily Pages: the opening minutes are what a
              Class Starter is for, and the two are graded differently. */}
          {isStarter
            ? `${WRITING_EXERCISE_LABELS['class-starter']} — opens the period`
            : `${WRITING_EXERCISE_LABELS['daily-pages']} — graded reflection`}
        </span>
      </div>

      <blockquote className="whitespace-pre-wrap border-l-2 border-primary/40 px-4 py-3.5 text-sm leading-relaxed text-foreground/90">
        {exercise.prompt}
      </blockquote>

      {targetTypeId || onToggle ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-primary/15 bg-primary/[0.04] px-4 py-2.5">
          {onToggle ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onToggle(!added)}
              data-testid="daily-pages-stack-toggle"
              title={added ? 'Click to remove from stack' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50',
                added
                  ? 'bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border border-primary/40 text-primary hover:bg-primary/5'
              )}
            >
              {added ? <Check size={14} /> : <Plus size={14} />}
              {added ? 'In the stack' : 'Add to stack'}
            </button>
          ) : null}
          {onReplace ? (
            <button
              type="button"
              disabled={disabled || added}
              onClick={onReplace}
              data-testid="daily-pages-replace"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/5 disabled:opacity-50"
            >
              <Repeat size={14} />
              Replace existing {isStarter ? 'class starter' : 'Daily Pages prompt'} with
              this one
            </button>
          ) : null}
          {created ? (
            <CreatedInYawp href={created.href} />
          ) : targetTypeId ? (
          <Link
            to={withPiece(
              dailyPagesCreateHref(targetTypeId, exercise.prompt, conversationId),
              materialId
            )}
            data-testid="daily-pages-create"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {onReplace
              ? `Create ${targetLabel === 'Class Starter' ? 'class starter' : 'Daily Pages'} assignment`
              : `Create this ${targetLabel} exercise for your class`}
          </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
