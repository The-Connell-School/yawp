/**
 * A unit as a board a teacher can act on, one day at a time.
 *
 * The point of the map is not that it summarises the unit — prose does that.
 * It is that every day carries its own way in. A teacher builds day 1 on
 * Sunday and day 4 on Wednesday, and the map is where they come back to do it,
 * so the build button is the loudest thing on each row.
 */
import {
  ArrowRight,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  Clapperboard,
  Flag,
  Gavel,
  Hammer,
  MessagesSquare,
  PenLine,
  Presentation,
  ScanSearch,
  Sunrise,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button';
import {
  buildDayDisplay,
  buildDayRequest,
  type UnitPlan,
} from '~/domain/lesson-planner/unit-plan';
import {
  ACTIVITY_LABELS,
  shortReading,
  unitDayActivities,
  type UnitActivity,
} from '~/domain/lesson-planner/unit-day-activities';

/**
 * Each activity's picture (Kevin, Nov 23: "book for reading, pencil for
 * writing, gavel for debate or seminar, a screen or projector for lecture").
 */
const ACTIVITY_ICONS: Record<UnitActivity, LucideIcon> = {
  starter: Sunrise,
  teach: Presentation,
  read: BookOpen,
  close: ScanSearch,
  discuss: MessagesSquare,
  seminar: Gavel,
  debate: Gavel,
  pairs: Users,
  film: Clapperboard,
  write: PenLine,
  check: ClipboardCheck,
};

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
    | ((message: string, day: { day: number; title: string; display?: string }) => void)
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
              {/* The day at a glance (Kevin, Nov 23: "less words... a picture
                  that highlights the major activities"); its words a click away. */}
              <DayAtAGlance day={day} />
              <details className="group mt-1.5" open={onBuildDay ? undefined : true}>
                <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Details</span>
                  <span className="hidden group-open:inline">Hide details</span>
                </summary>
                <div className="mt-1 space-y-1 text-xs">
                  <p className="text-muted-foreground">{day.objective}</p>
                  {day.reading ? (
                    <p>
                      <span className="font-medium">Reading:</span> {day.reading}
                    </p>
                  ) : null}
                  <p>{day.students}</p>
                  {day.check ? (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Check:</span> {day.check}
                    </p>
                  ) : null}
                </div>
              </details>
            </div>
            {builtDays?.[day.day] ? (
              <Button asChild size="sm" variant="outline-primary" className="shrink-0" data-testid="unit-open-day">
                <Link to={`/app/lesson-planner?c=${builtDays[day.day]}`}>
                  Open this day
                  <ArrowRight size={12} />
                </Link>
              </Button>
            ) : onBuildDay ? (
              <Button
                type="button"
                size="sm"
                variant="outline-primary"
                className="shrink-0"
                data-testid="unit-build-day"
                onClick={() =>
                  onBuildDay(buildDayRequest(unit, day), {
                    day: day.day,
                    title: day.title,
                    // The chat shows one line, not the request (Kevin, Oct 25, note 5).
                    display: buildDayDisplay(unit, day),
                  })
                }
                disabled={disabled}
              >
                <Hammer size={12} />
                Build this day
              </Button>
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

/** A day's main activities as icons with one-word labels, and its reading on one line. */
function DayAtAGlance({ day }: { day: UnitPlan['days'][number] }) {
  const reading = shortReading(day.reading);
  // A named reading says "read" itself, with the book; no second book beside it.
  const activities = unitDayActivities(day).filter((kind) => !(reading && kind === 'read'));
  if (!activities.length && !reading) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {activities.map((kind) => {
        const Icon = ACTIVITY_ICONS[kind];
        return (
          <span
            key={kind}
            data-testid="unit-day-activity"
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
          >
            <Icon size={12} aria-hidden />
            {ACTIVITY_LABELS[kind]}
          </span>
        );
      })}
      {reading ? (
        <span data-testid="unit-day-reading" className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <BookOpen size={12} aria-hidden className="shrink-0" />
          <span className="truncate">{reading}</span>
        </span>
      ) : null}
    </div>
  );
}
