import { cn } from '~/utils/misc';
import { LOCKED_DASHBOARD_GETTING_STARTED_TITLE } from '~/domain/free-tier/locked-dashboard-copy';

const STEPS = [
  { label: 'Awaiting administrative approval', current: true },
  { label: 'Administrator approved', current: false },
  { label: 'Invite students', current: false },
  { label: 'Create your first assignment', current: false },
] as const;

export function LockedDashboardGettingStarted() {
  const currentIndex = STEPS.findIndex((step) => step.current);
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <section
      aria-label={LOCKED_DASHBOARD_GETTING_STARTED_TITLE}
      className="rounded-xl border bg-popover p-5 shadow-sm"
      data-testid="locked-dashboard-getting-started"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">
          {LOCKED_DASHBOARD_GETTING_STARTED_TITLE}
        </h2>
        <span className="text-xs text-muted-foreground">
          Step {stepNumber} of {STEPS.length}
        </span>
      </div>
      <ol className="mt-2 list-none space-y-0 p-0">
        {STEPS.map((step, index) => (
          <li
            key={step.label}
            className={cn(
              'relative flex items-center gap-2.5 py-2 text-sm',
              step.current ? 'font-semibold text-foreground' : 'text-muted-foreground'
            )}
          >
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className="absolute bottom-0 left-[9px] top-[22px] w-0.5 bg-border"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] flex size-[18px] shrink-0 items-center justify-center rounded-full border-2',
                step.current
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground/40 bg-background'
              )}
            >
              {step.current ? (
                <span className="size-1.5 rounded-full bg-primary-foreground" />
              ) : null}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}
