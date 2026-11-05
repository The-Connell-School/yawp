import { Link } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import type { SidebarNavLink } from '~/routes/app/sidebar-nav';
import { Lock } from 'lucide-react';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';

/** Oct 26 PKG-04: sidebar usage rings removed; mobile warning dot no longer used. */
export function freeTierNavMobileWarningDot(
  _usage: FreeAccountUsage,
  _loading: boolean
): boolean {
  return false;
}

export function renderFreeTierNavTrailing(input: {
  link: SidebarNavLink;
  usage: FreeAccountUsage;
  loading: boolean;
  navExpanded: boolean;
  isMobile: boolean;
}) {
  const { link, usage, navExpanded, isMobile } = input;

  if (link.to === '/app/reporter' && usage.reporterLocked && navExpanded && !isMobile) {
    return (
      <Tooltip text="Unlocks after approval" contentProps={{ side: 'right' }}>
        <Lock size={14} className="shrink-0 text-muted-foreground" aria-hidden />
      </Tooltip>
    );
  }

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

export function renderFreeTierNavRow(ctx: NavRowContext): React.ReactNode | null {
  const {
    link,
    usage,
    navExpanded,
    isMobile,
    isActive,
    rowClassName,
    linkClassName,
    forceFullNavigation,
    icon,
  } = ctx;

  if (link.to !== '/app/reporter' || !usage.reporterLocked) {
    return null;
  }

  const reloadDocument = forceFullNavigation;

  const defaultLinkBody = (
    <>
      {icon}
      {navExpanded ? (
        <span className="min-w-0 truncate">{link.label}</span>
      ) : null}
    </>
  );

  if (!navExpanded && !isMobile) {
    return (
      <div key={link.to} className={cn(rowClassName, 'justify-center px-0')}>
        <Link
          to={link.to}
          reloadDocument={reloadDocument}
          aria-current={isActive ? 'page' : undefined}
          aria-label="Reporter"
          className={cn(
            linkClassName,
            'relative flex size-11 shrink-0 items-center justify-center'
          )}
          data-testid="usage-nav-collapsed-link-reporter-locked"
        >
          {icon}
          <Lock
            size={12}
            className="absolute bottom-0.5 right-0.5 text-muted-foreground"
            aria-hidden
          />
        </Link>
      </div>
    );
  }

  if (isMobile && navExpanded) {
    return (
      <div key={link.to} className={rowClassName}>
        <Link
          to={link.to}
          reloadDocument={reloadDocument}
          aria-current={isActive ? 'page' : undefined}
          className={linkClassName}
        >
          {defaultLinkBody}
        </Link>
        <Tooltip text="Unlocks after approval" contentProps={{ side: 'left' }}>
          <Lock size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        </Tooltip>
      </div>
    );
  }

  return null;
}
