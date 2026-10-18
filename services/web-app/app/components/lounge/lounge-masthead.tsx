import { Link, useLocation } from 'react-router';
import { MessageCircle, Settings } from 'lucide-react';
import { LOUNGE_NAME } from '~/domain/lounge/launch';

/**
 * The top of the Faculty Lounge while the community is on: just the serif
 * title, with settings and Contact Us pinned beside it, per the House Rules.
 * No label above the title and no tabs: the page is the Lounge's posts.
 */
export function LoungeMasthead({ action }: { action?: React.ReactNode }) {
  const location = useLocation();
  return (
    <header className="mx-auto w-full max-w-[960px] px-4 pt-8 sm:px-8 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <h1 className="lounge-serif text-[44px] leading-none text-foreground sm:text-[52px]">{LOUNGE_NAME}</h1>
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

