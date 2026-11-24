import { DoubleArrowLeftIcon, DoubleArrowRightIcon } from '~/components/icons';
import { Tooltip } from '~/components/ui/tooltip';
import { NavStateSwitch } from '~/routes/api.preferences.nav/route';

export const APP_NAV_COLLAPSE_LABEL = 'Hide labels';
export const APP_NAV_EXPAND_LABEL = 'Show labels';

/**
 * Footer row that switches the sidebar between icons + words and icons only.
 * The logo-hover arrow still works; this is the visible, labeled version so
 * teachers can find it. Desktop only: the mobile drawer is always expanded.
 */
export function AppNavCollapseToggle({ navExpanded }: { navExpanded: boolean }) {
  const label = navExpanded ? APP_NAV_COLLAPSE_LABEL : APP_NAV_EXPAND_LABEL;
  return (
    <NavStateSwitch>
      {({ fetcher }) => {
        const button = (
          <button
            type="submit"
            aria-label={label}
            data-testid="app-nav-collapse-toggle"
            data-nav-expanded={navExpanded ? 'true' : 'false'}
            disabled={['submitting', 'loading'].includes(fetcher.state)}
            className="app-nav-footer-action flex w-full items-center gap-2 border-0 bg-transparent text-left text-inherit transition max-sm:hidden"
          >
            {navExpanded ? (
              <DoubleArrowLeftIcon className="shrink-0" />
            ) : (
              <DoubleArrowRightIcon className="shrink-0" />
            )}
            {navExpanded ? (
              <span className="min-w-0 flex-1 text-left">{label}</span>
            ) : null}
          </button>
        );
        return navExpanded ? (
          button
        ) : (
          <Tooltip text={label} delayDuration={0}>
            {button}
          </Tooltip>
        );
      }}
    </NavStateSwitch>
  );
}
