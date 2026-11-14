import { CircularProgress } from '~/components/ui/circular-progress';
import { cn } from '~/utils/misc';

export type FreeTierSetupTimelinePhase = 'class-setup' | 'admin-approval';

const STEP_CLASS = "Let's set up your classroom";
const STEP_ADMIN = 'Administrator approval';

export function FreeTierSetupTimelineCard({
  phase,
  className,
}: {
  phase: FreeTierSetupTimelinePhase;
  className?: string;
}) {
  const classComplete = phase === 'admin-approval';
  const classProgress = classComplete ? 100 : 50;
  const adminProgress = phase === 'admin-approval' ? 50 : 0;

  return (
    <div
      data-testid="free-tier-setup-timeline-card"
      className={cn(
        'free-tier-setup-timeline-card w-full rounded-xl bg-white px-5 py-3 shadow-sm ring-1 ring-black/5 max-sm:px-3.5 max-sm:py-2.5',
        className
      )}
    >
      <ol
        aria-label="Setup steps"
        className="m-0 flex list-none items-center gap-0 p-0 max-sm:divide-x max-sm:divide-border"
      >
        <li
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium text-foreground max-sm:gap-2 max-sm:px-2 max-sm:text-[13px]',
            !classComplete && 'max-sm:pr-3'
          )}
          aria-current={phase === 'class-setup' ? 'step' : undefined}
        >
          <CircularProgress
            progress={classProgress}
            index={1}
            size="sm"
            className="shrink-0"
          />
          <span className="min-w-0 text-pretty">{STEP_CLASS}</span>
        </li>
        <li
          aria-hidden="true"
          className="mx-3 hidden h-px flex-1 bg-border max-sm:hidden sm:block"
        />
        <li
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 text-sm max-sm:gap-2 max-sm:px-2 max-sm:text-[13px]',
            phase === 'admin-approval'
              ? 'font-medium text-foreground'
              : 'font-normal text-muted-foreground'
          )}
          aria-current={phase === 'admin-approval' ? 'step' : undefined}
        >
          <CircularProgress
            progress={adminProgress}
            index={2}
            size="sm"
            className="shrink-0"
          />
          <span className="min-w-0 text-pretty">{STEP_ADMIN}</span>
        </li>
      </ol>
    </div>
  );
}
