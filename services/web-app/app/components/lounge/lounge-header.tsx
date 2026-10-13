import { Link } from 'react-router';
import { cn } from '~/utils/misc';

/**
 * The Teacher's Lounge page band. With the community on, it carries the
 * Community / Trainings tabs; the course grid keeps its own URL.
 */
export function LoungeHeader({
  active,
  description,
  action,
  showTabs = true,
}: {
  active: 'community' | 'trainings';
  description: string;
  action?: React.ReactNode;
  showTabs?: boolean;
}) {
  return (
    <div className="flex w-full border-b bg-secondary">
      <div className="mx-auto w-full max-w-screen-lg px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold">Teacher&apos;s Lounge</h1>
            <p className="mt-2 max-w-[520px] text-muted-foreground">{description}</p>
          </div>
          {action}
        </div>
        {showTabs ? (
          <nav aria-label="Teacher's Lounge" className="mt-4 flex gap-6">
            <LoungeTab to="/app/lounge" current={active === 'community'}>
              Community
            </LoungeTab>
            <LoungeTab to="/app/teacher-trainings" current={active === 'trainings'}>
              Trainings
            </LoungeTab>
          </nav>
        ) : (
          <div className="pb-3 sm:pb-5" />
        )}
      </div>
    </div>
  );
}

function LoungeTab({
  to,
  current,
  children,
}: {
  to: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'border-b-2 pb-3 text-[15px]',
        current
          ? 'border-primary font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </Link>
  );
}
