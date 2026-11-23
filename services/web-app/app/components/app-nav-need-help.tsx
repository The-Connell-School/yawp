import { appSidebarIcons } from '~/components/app-sidebar-icons';
import { Tooltip } from '~/components/ui/tooltip';

export const APP_NAV_NEED_HELP_MAILTO = 'mailto:support@yawp.school';

export function AppNavNeedHelp({ navExpanded }: { navExpanded: boolean }) {
  const link = (
    <a
      href={APP_NAV_NEED_HELP_MAILTO}
      data-testid="app-nav-need-help"
      aria-label="Need help?"
      title={navExpanded ? undefined : 'Need help?'}
      className="app-nav-footer-action flex w-full items-center gap-2 text-left text-inherit no-underline transition"
    >
      {appSidebarIcons.help}
      {navExpanded ? (
        <span className="min-w-0 flex-1 text-left">Need help?</span>
      ) : null}
    </a>
  );

  if (navExpanded) {
    return link;
  }

  return (
    <Tooltip text="Need help?" delayDuration={0}>
      {link}
    </Tooltip>
  );
}