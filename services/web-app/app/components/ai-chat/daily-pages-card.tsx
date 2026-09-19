/**
 * A warm-up the planner wrote, with a way to actually assign it.
 *
 * The prompt used to arrive as a blockquote with a sentence explaining that it
 * was not from the library. A teacher does not need the provenance; they need
 * the exercise in front of their class tomorrow. So the prompt is shown as
 * students would read it, and the button underneath opens the Daily Pages
 * assignment sheet with it already filled in.
 */
import { Link } from 'react-router';
import { PenLine, Sparkles } from 'lucide-react';
import {
  dailyPagesCreateHref,
  type DailyPagesExercise,
} from '~/domain/lesson-planner/daily-pages-block';

export function DailyPagesCard({
  exercise,
  assignmentTypeId,
  conversationId,
}: {
  exercise: DailyPagesExercise;
  /** Null when this org does not have Daily Pages — then it is just a prompt. */
  assignmentTypeId: string | null;
  /** Travels with the teacher so they can get back to this lesson. */
  conversationId?: string | null;
}) {
  return (
    <div
      data-testid="daily-pages-card"
      className="mt-3 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.03]"
    >
      <div className="flex items-center gap-2 border-b border-primary/15 px-4 py-2.5">
        <PenLine size={15} className="shrink-0 text-primary" />
        <span className="text-sm font-medium">Daily Pages warm-up</span>
      </div>

      <blockquote className="whitespace-pre-wrap border-l-2 border-primary/40 px-4 py-3.5 text-sm leading-relaxed text-foreground/90">
        {exercise.prompt}
      </blockquote>

      {assignmentTypeId ? (
        <div className="border-t border-primary/15 bg-primary/[0.04] px-4 py-2.5">
          <Link
            to={dailyPagesCreateHref(
              assignmentTypeId,
              exercise.prompt,
              conversationId
            )}
            data-testid="daily-pages-create"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Sparkles size={13} />
            Create this Daily Pages exercise for your class
          </Link>
        </div>
      ) : null}
    </div>
  );
}
