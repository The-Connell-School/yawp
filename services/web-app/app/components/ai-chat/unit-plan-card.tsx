/**
 * A unit as a board a teacher can act on, one day at a time.
 *
 * The point of the map is not that it summarises the unit — prose does that.
 * It is that every day carries its own way in. A teacher builds day 1 on
 * Sunday and day 4 on Wednesday, and the map is where they come back to do it,
 * so the build button is the loudest thing on each row.
 */
import { CalendarRange, Hammer, Flag, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import {
  buildDayRequest,
  type UnitPlan,
} from '~/domain/lesson-planner/unit-plan';

export function UnitPlanCard({
  unit,
  onBuildDay,
  builtDays,
  disabled,
}: {
  unit: UnitPlan;
  /**
   * Sends the day's build request as the teacher. Absent in the printed
   * packet, where there is nothing to click.
   */
  onBuildDay?:
    | ((message: string, day: { day: number; title: string }) => void)
    | null;
  /**
   * Day number → the conversation that day's lesson already lives in. A built
   * day offers a way back into it rather than a second build.
   */
  builtDays?: Record<number, string>;
  disabled?: boolean;
}) {
  const periods = unit.days.length;

  return (
    <div
      data-testid="unit-plan-card"
      className="overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.04]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarRange size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{unit.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[`${periods} ${periods === 1 ? 'day' : 'days'}`, unit.subtitle]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <ol className="divide-y divide-primary/15">
        {unit.days.map((day) => (
          <li
            key={day.day}
            data-testid="unit-plan-day"
            className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold tabular-nums text-primary">
              {day.day}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">
                {day.title}
                {day.minutes ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {day.minutes} min
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {day.objective}
              </p>
              <p className="mt-1 text-xs">{day.students}</p>
              {day.check ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Check:</span> {day.check}
                </p>
              ) : null}
            </div>
            {builtDays?.[day.day] ? (
              <Link
                to={`/app/lesson-planner?c=${builtDays[day.day]}`}
                data-testid="unit-open-day"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/20"
              >
                Open this day
                <ArrowRight size={12} />
              </Link>
            ) : onBuildDay ? (
              <button
                type="button"
                data-testid="unit-build-day"
                onClick={() =>
                  onBuildDay(buildDayRequest(unit, day), {
                    day: day.day,
                    title: day.title,
                  })
                }
                disabled={disabled}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-background px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-50"
              >
                <Hammer size={12} />
                Build this day
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      {unit.endsWith ? (
        <p className="flex items-start gap-2 border-t border-primary/20 bg-primary/[0.03] px-4 py-2.5 text-xs text-muted-foreground">
          <Flag size={13} className="mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-foreground">Ends with:</span>{' '}
            {unit.endsWith}
          </span>
        </p>
      ) : null}
    </div>
  );
}
