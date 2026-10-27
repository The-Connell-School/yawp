import { cn } from '~/utils/misc';
import { LOCKED_DASHBOARD_GETTING_STARTED_TITLE } from '~/domain/free-tier/locked-dashboard-copy';

const STEPS = [
  { label: 'Awaiting administrative approval', current: true },
  { label: 'Administrator approved', current: false },
  { label: 'Invite students', current: false },
  { label: 'Create your first assignment', current: false },
] as const;

const PE3_ACCENT = 'hsl(14.8837 58.9041% 57.0588%)';

export function LockedDashboardGettingStarted() {
  const currentIndex = STEPS.findIndex((step) => step.current);
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <section
      aria-label={LOCKED_DASHBOARD_GETTING_STARTED_TITLE}
      className="rounded-xl border bg-popover p-[18px] shadow-sm"
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
      <ol className="mt-0 flex list-none flex-col gap-1.5 p-0">
        {STEPS.map((step, index) => (
          <li
            key={step.label}
            className={cn(
              'relative flex items-center gap-2.5 py-1.5 text-sm',
              step.current
                ? 'font-semibold text-[#1b1b1b]'
                : 'font-normal text-muted-foreground'
            )}
          >
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className="absolute bottom-[-14px] left-[9px] top-[22px] w-0.5 bg-border"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] box-border flex size-5 shrink-0 items-center justify-center rounded-full border-2 bg-background',
                step.current ? 'border-[hsl(14.8837_58.9041%_57.0588%)]' : 'border-border'
              )}
              style={
                step.current
                  ? { borderColor: PE3_ACCENT }
                  : undefined
              }
            >
              {step.current ? (
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: PE3_ACCENT }}
                />
              ) : null}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}
