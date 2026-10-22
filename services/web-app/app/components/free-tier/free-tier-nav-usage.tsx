import { Link } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import { lessonPlannerMonthlyUsage } from '~/domain/free-tier/inapp-usage';
import {
  usageNavLevelFromCount,
  usageNavMobileWarningDot,
  type UsageNavLevel,
} from '~/domain/free-tier/usage-nav-meter';
import { UsageNavRing } from '~/components/free-tier/usage-nav-ring';
import { UsageNavCollapsedLink } from '~/components/free-tier/usage-nav-collapsed-link';
import type { SidebarNavLink } from '~/routes/app/sidebar-nav';
import { Lock } from 'lucide-react';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';

export function freeTierNavMobileWarningDot(
  usage: FreeAccountUsage,
  loading: boolean
): boolean {
  if (!usage.usageNavMetersAvailable || loading) return false;
  const levels: UsageNavLevel[] = [];
  if (usage.lessonPlannerMonthlyMetering || usage.monthly) {
    levels.push(
      usageNavLevelFromCount(lessonPlannerMonthlyUsage(usage))
    );
  }
  if (usage.monthly && usage.reporter) {
    levels.push(usageNavLevelFromCount(usage.reporter));
  }
  return usageNavMobileWarningDot(levels);
}

export function renderFreeTierNavTrailing(input: {
  link: SidebarNavLink;
  usage: FreeAccountUsage;
  loading: boolean;
  navExpanded: boolean;
  isMobile: boolean;
}) {
  const { link, usage, loading, navExpanded, isMobile } = input;
  if (!navExpanded || isMobile) return null;

  const metersHidden = usage.usageNavMetersAvailable === false;
  const renewsAt = usage.renewsAt;

  if (link.to === '/app/lesson-planner') {
    if (!usage.lessonPlannerMonthlyMetering && !usage.monthly) return null;
    return (
      <UsageNavRing
        feature="lesson-planner"
        count={lessonPlannerMonthlyUsage(usage)}
        renewsAtIso={renewsAt}
        loading={loading}
        hidden={metersHidden}
        variant="expanded-trailing"
      />
    );
  }

  if (link.to === '/app/reporter') {
    if (usage.reporterLocked || !usage.monthly) {
      return (
        <Tooltip text="Unlocks after approval" contentProps={{ side: 'right' }}>
          <Lock size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        </Tooltip>
      );
    }
    if (!usage.reporter) return null;
    return (
      <UsageNavRing
        feature="reporter"
        count={usage.reporter}
        renewsAtIso={renewsAt}
        loading={loading}
        hidden={metersHidden}
        variant="expanded-trailing"
      />
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
    loading,
    navExpanded,
    isMobile,
    isActive,
    rowClassName,
    linkClassName,
    forceFullNavigation,
    icon,
  } = ctx;

  const metersHidden = usage.usageNavMetersAvailable === false;
  const renewsAt = usage.renewsAt;
  const reloadDocument = forceFullNavigation;

  const defaultLinkBody = (
    <>
      {icon}
      {navExpanded ? (
        <span className="min-w-0 truncate">{link.label}</span>
      ) : null}
    </>
  );

  if (link.to === '/app/lesson-planner') {
    if (!usage.lessonPlannerMonthlyMetering && !usage.monthly) return null;

    if (isMobile && navExpanded) {
      if (metersHidden && !loading) return null;
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
          <UsageNavRing
            feature="lesson-planner"
            count={lessonPlannerMonthlyUsage(usage)}
            renewsAtIso={renewsAt}
            loading={loading}
            hidden={metersHidden}
            variant="mobile-drawer"
          />
        </div>
      );
    }

    if (!navExpanded && !isMobile) {
      if (metersHidden && !loading) return null;
      return (
        <div key={link.to} className={cn(rowClassName, 'justify-center px-0')}>
          <UsageNavCollapsedLink
            to={link.to}
            feature="lesson-planner"
            icon={icon}
            count={lessonPlannerMonthlyUsage(usage)}
            renewsAtIso={renewsAt}
            loading={loading}
            isActive={isActive}
            reloadDocument={reloadDocument}
          />
        </div>
      );
    }

    return null;
  }

  if (link.to === '/app/reporter') {
    if (usage.reporterLocked || !usage.monthly) {
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

    if (!usage.reporter) return null;

    if (isMobile && navExpanded) {
      if (metersHidden && !loading) return null;
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
          <UsageNavRing
            feature="reporter"
            count={usage.reporter}
            renewsAtIso={renewsAt}
            loading={loading}
            hidden={metersHidden}
            variant="mobile-drawer"
          />
        </div>
      );
    }

    if (!navExpanded && !isMobile) {
      if (metersHidden && !loading) return null;
      return (
        <div key={link.to} className={cn(rowClassName, 'justify-center px-0')}>
          <UsageNavCollapsedLink
            to={link.to}
            feature="reporter"
            icon={icon}
            count={usage.reporter}
            renewsAtIso={renewsAt}
            loading={loading}
            isActive={isActive}
            reloadDocument={reloadDocument}
          />
        </div>
      );
    }

    return null;
  }

  return null;
}
