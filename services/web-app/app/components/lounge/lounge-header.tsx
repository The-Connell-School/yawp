import { Link, useLocation } from 'react-router';
import { MessageCircle, Settings } from 'lucide-react';
import { LOUNGE_NAME } from '~/domain/lounge/launch';
import { cn } from '~/utils/misc';

/**
 * The Faculty Lounge page band, shown while the community is on. It carries
 * Contact Us (pinned at the top, per the House Rules), the teacher's Lounge
 * settings, and the Community / Trainings tabs; the course grid keeps its
 * own URL.
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
  const location = useLocation();
  return (
    <div className="flex w-full border-b bg-secondary">
      <div className="mx-auto w-full max-w-screen-lg px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold">{LOUNGE_NAME}</h1>
            <p className="mt-2 max-w-[520px] text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/lounge/settings"
              aria-label="Lounge settings"
              title="Lounge settings"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <Settings size={18} aria-hidden="true" />
            </Link>
            <Link
              to={`/app/lounge/contact?from=${encodeURIComponent(location.pathname)}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-[15px] font-medium hover:border-primary/50"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Contact Us
            </Link>
            {action}
          </div>
        </div>
        {showTabs ? (
          <nav aria-label={LOUNGE_NAME} className="mt-4 flex gap-6">
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
