import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import type { SidebarNavLink } from '~/routes/app/sidebar-nav';

/**
 * PKG-04 removed sidebar usage rings. PKG-07 removes the Reporter lock icon.
 * The in-app "Unlocks after approval" card is unchanged. Returning null lets
 * the default nav row render Reporter with no lock badge.
 */
export function freeTierNavMobileWarningDot(
  _usage: FreeAccountUsage,
  _loading: boolean
): boolean {
  return false;
}

export function renderFreeTierNavTrailing(_input: {
  link: SidebarNavLink;
  usage: FreeAccountUsage;
  loading: boolean;
  navExpanded: boolean;
  isMobile: boolean;
}) {
  return null;
}

type NavRowContext = {
  link: SidebarNavLink;
  usage: FreeAccountUsage;
  loading: boolean;
  navExpanded: boolean;
  isMobile: boolean;
  isActive: boolean;
  rowClassName: string;
  linkClassName: string;
  forceFullNavigation: boolean;
  icon: React.ReactNode;
};

export function renderFreeTierNavRow(
  _ctx: NavRowContext
): React.ReactNode | null {
  return null;
}
