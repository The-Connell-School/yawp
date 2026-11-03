/**
 * Under a reply that plans several days (Brian's run 5, items 1 and R2):
 * each day is its own lesson, with its own run of show, stack and plan,
 * together in a unit folder in the library. The newest week makes its day
 * lessons by itself; a later version of the week can replace them, keeping
 * any day the teacher has changed. "Save this week as a framework" keeps
 * its shape for next week (R3).
 */
import { useEffect, useRef } from 'react';
import { Link, useFetcher } from 'react-router';
import { CalendarDays, Check, Loader2, RefreshCw } from 'lucide-react';
import type { PlanDay } from '~/domain/lesson-planner/plan-days';

type Made = { ok?: boolean; error?: string; days?: Array<{ day: number; conversationId: string; kept?: boolean; title: string }> };

export function DayLessonsCard({
  conversationId,
  messageId,
  days,
  builtDays,
  sourceMessageId = null,
  isLast = false,
  frameworksOn = false,
  disabled,
}: {
  conversationId: string;
  messageId: string;
  days: PlanDay[];
  /** Day number → that day's lesson, once made. */
  builtDays: Record<number, string>;
  /** The reply the day lessons were made from, when known. */
  sourceMessageId?: string | null;
  /** The newest reply: the one that makes the days by itself. */
  isLast?: boolean;
  /** Templates on: the week can be saved as a framework. */
  frameworksOn?: boolean;
  disabled?: boolean;
}) {
  const fetcher = useFetcher<Made>();
  const framework = useFetcher<{ ok?: boolean; error?: string }>();
  const made: Record<number, string> = { ...builtDays };
  for (const day of fetcher.data?.days ?? []) made[day.day] = day.conversationId;
  const anyMade = Object.keys(made).length > 0;
  const allMade = days.every((day) => made[day.day]);
  const busy = fetcher.state !== 'idle';
  // A later version of a week whose days were made from another reply.
  const otherVersion = anyMade && Boolean(sourceMessageId) && sourceMessageId !== messageId && !fetcher.data?.days;
  const kept = (fetcher.data?.days ?? []).filter((day) => day.kept);

  const submit = (intent: 'make-days' | 'replace-days') =>
    fetcher.submit({ intent, conversationId, messageId }, { method: 'post', action: '/api/domain/lesson-planner/days' });

  // The newest week makes its days without being asked (Brian: "the planner
  // should do this automatically"). Making them twice opens the same days.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || disabled || !isLast || anyMade) return;
    started.current = true;
    submit('make-days');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLast, anyMade, disabled]);

  return (
    <section data-testid="day-lessons" className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays size={15} className="text-primary" />
        {days.length} days, each its own lesson
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Each day gets its own run of show, stack and lesson plan, together in a folder in your library.
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

      {busy ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> Making the day lessons…
        </p>
      ) : allMade ? null : (
        <button
          type="button"
          data-testid="make-day-lessons"
          disabled={disabled}
          onClick={() => submit('make-days')}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <CalendarDays size={14} /> Make each day its own lesson
        </button>
      )}

      {otherVersion && !busy ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          These days open the lessons made from an earlier version of the week.
          <button
            type="button"
            data-testid="replace-day-lessons"
            disabled={disabled}
            onClick={() => {
              if (window.confirm('Replace the day lessons with this version? A day you have changed is kept as it is.')) submit('replace-days');
            }}
            className="ml-2 inline-flex items-center gap-1 font-semibold underline"
          >
            <RefreshCw size={12} /> Replace the day lessons with this version
          </button>
        </div>
      ) : null}
      {kept.length ? (
        <p data-testid="day-lessons-kept" className="mt-2 text-xs text-muted-foreground">
          Kept as you changed {kept.length === 1 ? 'it' : 'them'}: {kept.map((day) => `Day ${day.day}`).join(', ')}.
        </p>
      ) : null}

      {allMade && frameworksOn ? (
        <framework.Form method="post" action="/api/domain/lesson-planner/stack" className="mt-3">
          <input type="hidden" name="intent" value="save-framework" />
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="messageId" value={messageId} />
          {framework.data?.ok ? (
            <p data-testid="framework-saved" className="flex items-center gap-1 text-xs font-semibold text-primary">
              <Check size={13} /> Saved as a framework. Start next week from it in Build from my templates.
            </p>
          ) : (
            <button
              type="submit"
              data-testid="save-framework"
              disabled={disabled || framework.state !== 'idle'}
              className="text-xs font-semibold text-primary underline disabled:opacity-60"
            >
              Save this week as a framework
            </button>
          )}
          {framework.data?.error ? <p className="mt-1 text-xs text-red-700">{framework.data.error}</p> : null}
        </framework.Form>
      ) : null}
      {fetcher.data?.error ? <p className="mt-1 text-xs text-red-700">{fetcher.data.error}</p> : null}
    </section>
  );
}
