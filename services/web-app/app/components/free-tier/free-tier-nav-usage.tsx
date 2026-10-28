import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import { lessonPlannerMonthlyUsage } from '~/domain/free-tier/inapp-usage';
import {
  usageNavLevelFromCount,
  usageNavMobileWarningDot,
  type UsageNavLevel,
} from '~/domain/free-tier/usage-nav-meter';
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

const UNLOCKS_AFTER_APPROVAL = 'Unlocks after approval';

function FreeTierNavUnlockLock() {
  return (
    <Tooltip text={UNLOCKS_AFTER_APPROVAL} contentProps={{ side: 'left' }}>
      <span
        className="flex shrink-0 items-center self-center px-2 text-muted-foreground"
        aria-label={UNLOCKS_AFTER_APPROVAL}
      >
        <Lock size={14} aria-hidden />
      </span>
    </Tooltip>
  );
}

function renderFreeTierLockedApprovalNavRow({
  link,
  icon,
  navExpanded,
  isMobile,
  isActive,
  rowClassName,
  linkClassName,
  reloadDocument,
}: {
  link: SidebarNavLink;
  icon: ReactNode;
  navExpanded: boolean;
  isMobile: boolean;
  isActive: boolean;
  rowClassName: string;
  linkClassName: string;
  reloadDocument: boolean;
}) {
  if (navExpanded) {
    return (
      <div
        key={link.to}
        className={cn(rowClassName, 'opacity-75')}
        data-testid={`free-tier-nav-locked-${link.to}`}
      >
        <Link
          to={link.to}
          reloadDocument={reloadDocument}
          aria-current={isActive ? 'page' : undefined}
          className={cn(linkClassName, 'min-w-0 flex-1 items-center')}
        >
          {icon}
          <span className="min-w-0 truncate">{link.label}</span>
        </Link>
        <FreeTierNavUnlockLock />
      </div>
    );
  }

  if (!isMobile) {
    return (
      <div
        key={link.to}
        className={cn(rowClassName, 'justify-center px-0 opacity-75')}
      >
        <Link
          to={link.to}
          reloadDocument={reloadDocument}
          aria-current={isActive ? 'page' : undefined}
          aria-label={`${link.label}. ${UNLOCKS_AFTER_APPROVAL}`}
          className={cn(
            linkClassName,
            'flex size-11 shrink-0 items-center justify-center'
          )}
        >
          {icon}
        </Link>
      </div>
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
  teachingLocked?: boolean;
  icon: ReactNode;
};

export function renderFreeTierNavTrailing() {
  return null;
}

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
    teachingLocked = false,
    icon,
  } = ctx;

  const reloadDocument = forceFullNavigation;

  if (link.to === '/app/lesson-planner') {
    const showLockedPreview = usage.reporterLocked || teachingLocked;
    if (showLockedPreview) {
      return renderFreeTierLockedApprovalNavRow({
        link,
        icon,
        navExpanded,
        isMobile,
        isActive,
        rowClassName,
        linkClassName,
        reloadDocument,
      });
    }
    if (!usage.lessonPlannerMonthlyMetering && !usage.monthly) return null;
    return null;
  }

  if (link.to === '/app/reporter') {
    const showLockedPreview =
      usage.reporterLocked || !usage.monthly || teachingLocked;
    if (showLockedPreview) {
      return renderFreeTierLockedApprovalNavRow({
        link,
        icon,
        navExpanded,
        isMobile,
        isActive,
        rowClassName,
        linkClassName,
        reloadDocument,
      });
    }
    if (!usage.reporter) return null;
    return null;
  }

  return null;
}
