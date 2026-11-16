import { Link, useLocation } from 'react-router';
import { MessageCircle, Settings } from 'lucide-react';
import { LOUNGE_NAME } from '~/domain/lounge/launch';
import { cn } from '~/utils/misc';

/**
 * The top of the Faculty Lounge: the Fraunces title, Community under it,
 * and Contact Us pinned at the top, per the House Rules. Trainings may
 * come back later as videos; the course records stay, the tab does not.
 */
export function LoungeMasthead({ action }: { action?: React.ReactNode }) {
  const location = useLocation();
  return (
    <header data-lounge-page className="mx-auto w-full max-w-[960px] px-4 pt-8 sm:px-8 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col">
          <h1 className="faculty-lounge-heading text-[44px] leading-none text-foreground sm:text-[52px]">
            {LOUNGE_NAME}
          </h1>
          <nav aria-label={LOUNGE_NAME} className="mt-3 flex items-center gap-2 text-[15px]">
            <MastheadTab to="/app/lounge" current>
              Community
            </MastheadTab>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/app/lounge/settings"
            aria-label="Lounge settings"
            title="Lounge settings"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-popover text-muted-foreground hover:text-foreground"
          >
            <Settings size={18} aria-hidden="true" />
          </Link>
          <Link
            to={`/app/lounge/contact?from=${encodeURIComponent(location.pathname)}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-popover px-4 text-[15px] font-medium hover:border-foreground/40"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Contact Us
          </Link>
          {action}
        </div>
      </div>
    </header>
  );
}

function MastheadTab({ to, current, children }: { to: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center underline-offset-4',
        current ? 'font-medium text-foreground underline decoration-2' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </Link>
  );
}
