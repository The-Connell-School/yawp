import { DoubleArrowLeftIcon, DoubleArrowRightIcon } from '~/components/icons';
import { Button } from '~/components/ui/button';
import { Tooltip } from '~/components/ui/tooltip';
import { NavStateSwitch } from '~/routes/api.preferences.nav/route';

export const APP_NAV_COLLAPSE_LABEL = 'Hide labels';
export const APP_NAV_EXPAND_LABEL = 'Show labels';
export const APP_NAV_HEADER_COLLAPSE_LABEL = 'Collapse app navigation';

/**
 * Header collapse control. `Button` defaults to type="button", which does not
 * submit the nav preference form, so this must stay type="submit".
 */
export function AppNavHeaderCollapseButton({
  disabled,
}: {
  disabled: boolean;
}) {
  return (
    <Button
      type="submit"
      size="icon-sm"
      variant="ghost"
      className="hidden sm:inline-flex"
      aria-label={APP_NAV_HEADER_COLLAPSE_LABEL}
      data-testid="app-nav-header-collapse"
      disabled={disabled}
    >
      <DoubleArrowLeftIcon />
    </Button>
  );
}

/**
 * Footer row that switches the sidebar between icons + words and icons only.
 * Desktop only: the mobile drawer is always expanded. The logo-hover arrow
 * stays in the header.
 */
export function AppNavCollapseToggleButton({
  navExpanded,
  disabled,
}: {
  navExpanded: boolean;
  disabled: boolean;
}) {
  const label = navExpanded ? APP_NAV_COLLAPSE_LABEL : APP_NAV_EXPAND_LABEL;
  const button = (
    <button
      type="submit"
      aria-label={label}
      data-testid="app-nav-collapse-toggle"
      data-nav-expanded={navExpanded ? 'true' : 'false'}
      disabled={disabled}
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
}

export function AppNavCollapseToggle({ navExpanded }: { navExpanded: boolean }) {
  return (
    <NavStateSwitch>
      {({ fetcher }) => (
        <AppNavCollapseToggleButton
          navExpanded={navExpanded}
          disabled={['submitting', 'loading'].includes(fetcher.state)}
        />
      )}
    </NavStateSwitch>
  );
}
