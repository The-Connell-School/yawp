import type { ReactNode } from 'react';
import { cn } from '~/utils/misc';

/**
 * Teacher home columns.
 *
 * While a classroom is waiting for approval, the approval card is a full-width
 * banner under the welcome heading. It must not sit in a second grid column:
 * that column shared a row with the heading and, near 1,130px, collapsed the
 * class list into a narrow left strip.
 *
 * After approval, an optional advocate rail can sit beside the main column
 * once the dashboard is wide enough for it.
 */
export function TeacherDashboardColumns({
  welcome,
  pendingBanner,
  advocateRail,
  children,
}: {
  welcome: ReactNode;
  pendingBanner?: ReactNode | null;
  advocateRail?: ReactNode | null;
  children: ReactNode;
}) {
  const sideRail = Boolean(advocateRail) && !pendingBanner;

  return (
    <div
      className={cn(
        'locked-home-b2 free-dashboard w-full pb-24',
        sideRail && 'locked-home-b2--with-rail'
      )}
    >
      <div className="mx-auto w-full max-w-screen-xl">
        <div className="locked-home-columns">
          <div className="locked-home-main flex w-full min-w-0 flex-col">
            {welcome}
            {pendingBanner ? (
              <div className="locked-home-pending-banner">{pendingBanner}</div>
            ) : sideRail ? (
              <aside
                className="locked-home-rail-mobile"
                aria-label="Your request and next steps"
              >
                {advocateRail}
              </aside>
            ) : null}
            <div className="locked-home-sections flex flex-col gap-4">
              {children}
            </div>
          </div>
          {sideRail ? (
            <aside
              className="locked-home-rail-desktop"
              aria-label="Your request and next steps"
            >
              {advocateRail}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
