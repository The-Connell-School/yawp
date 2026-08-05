/**
 * The planner's two standing questions, as controls instead of typing.
 *
 * A period length is a point on a spectrum and a set of activities is a list to
 * tick, so neither should cost a teacher a sentence between classes. Both
 * answers leave as one ordinary chat message, so nothing downstream has to know
 * this control exists.
 */
import { useState } from 'react';
import { Clock, Send, Shapes } from 'lucide-react';
import {
  composeAskReply,
  LESSON_ACTIVITIES,
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
  LESSON_MINUTES_STEP,
  PLANNER_PICKS_ACTIVITIES,
  type LessonAsk,
} from '~/domain/lesson-planner/lesson-ask';
import { cn } from '~/utils/misc';

/** "50 min", "1 hr 15 min" — how a teacher says the number out loud. */
function describeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

const ACTIVITY_GROUPS = ['whole class', 'small group', 'independent'] as const;

export function LessonAskCard({
  asks,
  onSend,
  disabled,
}: {
  asks: LessonAsk[];
  onSend: (message: string) => void;
  disabled?: boolean;
}) {
  const minutesAsk = asks.find((ask) => ask.kind === 'minutes');
  const wantsActivities = asks.some((ask) => ask.kind === 'activities');

  const [minutes, setMinutes] = useState(
    minutesAsk?.kind === 'minutes' ? minutesAsk.defaultMinutes : null
  );
  const [activityIds, setActivityIds] = useState<string[]>([]);

  function toggleActivity(id: string) {
    setActivityIds((prev) => {
      if (prev.includes(id)) return prev.filter((other) => other !== id);
      // Handing the choice back and choosing are mutually exclusive.
      if (id === PLANNER_PICKS_ACTIVITIES) return [id];
      return [
        ...prev.filter((other) => other !== PLANNER_PICKS_ACTIVITIES),
        id,
      ];
    });
  }

  const message = composeAskReply({ minutes, activityIds });
  const plannerPicks = activityIds.includes(PLANNER_PICKS_ACTIVITIES);

  return (
    <div
      data-testid="lesson-ask-card"
      className="mt-3 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.03]"
    >
      {minutes !== null ? (
        <div className="border-b border-primary/15 px-4 py-3.5">
          <div className="mb-3 flex items-center gap-2">
            <Clock size={15} className="shrink-0 text-primary" />
            <span className="text-sm font-medium">How long is the lesson?</span>
            <span
              data-testid="lesson-minutes-value"
              className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold tabular-nums text-primary"
            >
              {describeMinutes(minutes)}
            </span>
          </div>
          <input
            type="range"
            aria-label="Lesson length in minutes"
            min={LESSON_MINUTES_MIN}
            max={LESSON_MINUTES_MAX}
            step={LESSON_MINUTES_STEP}
            value={minutes}
            disabled={disabled}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{LESSON_MINUTES_MIN} min</span>
            <span>{describeMinutes(LESSON_MINUTES_MAX)}</span>
          </div>
        </div>
      ) : null}

      {wantsActivities ? (
        <div className="px-4 py-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <Shapes size={15} className="shrink-0 text-primary" />
            <span className="text-sm font-medium">
              What kinds of activities do you want?
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              Check all that apply
            </span>
          </div>

          {/* Offered first and always: a teacher who does not want to choose
              should not have to read the list to find that out. */}
          <label
            className={cn(
              'mb-3 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
              plannerPicks
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-border hover:bg-foreground/[0.03]'
            )}
          >
            <input
              type="checkbox"
              checked={plannerPicks}
              disabled={disabled}
              onChange={() => toggleActivity(PLANNER_PICKS_ACTIVITIES)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            You pick the ones that fit this lesson best
          </label>

          <div
            className={cn(
              'flex flex-col gap-3 transition-opacity',
              plannerPicks && 'pointer-events-none opacity-40'
            )}
          >
            {ACTIVITY_GROUPS.map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LESSON_ACTIVITIES.filter(
                    (activity) => activity.group === group
                  ).map((activity) => {
                    const checked = activityIds.includes(activity.id);
                    return (
                      <label
                        key={activity.id}
                        className={cn(
                          'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
                          // The input carries the focus, so the chip has to show
                          // it — a hidden checkbox is otherwise invisible to
                          // anyone tabbing through.
                          'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1',
                          checked
                            ? 'border-primary bg-primary/10 font-medium text-primary'
                            : 'border-border hover:bg-foreground/[0.03]'
                        )}
                      >
                        {/* Transparent but full-size, so the whole chip is the
                            real control rather than a label standing in front
                            of a 1px checkbox nothing can actually hit. */}
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || plannerPicks}
                          onChange={() => toggleActivity(activity.id)}
                          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
                        />
                        {activity.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 border-t border-primary/15 bg-primary/[0.04] px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {message || 'Set the length or pick some activities.'}
        </p>
        <button
          type="button"
          data-testid="lesson-ask-send"
          disabled={disabled || !message}
          onClick={() => onSend(message)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          <Send size={13} />
          Send
        </button>
      </div>
    </div>
  );
}
