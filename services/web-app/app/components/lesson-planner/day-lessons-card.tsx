/**
 * Under a reply that plans several days (Brian's run 5, item 1): each day
 * becomes its own lesson, with its own run of show, stack and plan, in a
 * unit folder in the library. One click makes them; then each opens.
 */
import { Link, useFetcher } from 'react-router';
import { CalendarDays, Loader2 } from 'lucide-react';
import type { PlanDay } from '~/domain/lesson-planner/plan-days';

export function DayLessonsCard({
  conversationId,
  messageId,
  days,
  builtDays,
  disabled,
}: {
  conversationId: string;
  messageId: string;
  days: PlanDay[];
  /** Day number → that day's lesson, once made. */
  builtDays: Record<number, string>;
  disabled?: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; days?: Array<{ day: number; conversationId: string }> }>();
  const made: Record<number, string> = { ...builtDays };
  for (const day of fetcher.data?.days ?? []) made[day.day] = day.conversationId;
  const allMade = days.every((day) => made[day.day]);
  const busy = fetcher.state !== 'idle';

  return (
    <section data-testid="day-lessons" className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays size={15} className="text-primary" />
        {days.length} days, each its own lesson
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Each day gets its own run of show, stack and lesson plan, together in a unit in your library.
      </p>
      <ol className="mt-3 flex flex-col gap-1.5">
        {days.map((day) => (
          <li key={day.day} data-testid="day-lesson" className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-semibold">Day {day.day}</span> · {day.title}
              {day.minutes ? <span className="text-muted-foreground"> · {day.minutes} min</span> : null}
            </span>
            {made[day.day] ? (
              <Link
                to={`/app/lesson-planner/${made[day.day]}/packet`}
                data-testid="day-lesson-open"
                className="text-xs font-semibold text-primary underline"
              >
                Open Day {day.day}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {allMade ? null : (
        <fetcher.Form method="post" action="/api/domain/lesson-planner/days" className="mt-3">
          <input type="hidden" name="intent" value="make-days" />
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="messageId" value={messageId} />
          <button
            type="submit"
            data-testid="make-day-lessons"
            disabled={disabled || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
            {busy ? 'Making the lessons…' : 'Make each day its own lesson'}
          </button>
          {fetcher.data?.error ? <p className="mt-1 text-xs text-red-700">{fetcher.data.error}</p> : null}
        </fetcher.Form>
      )}
    </section>
  );
}
