import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import {
  lessonPlannerMonthlyUsage,
} from '~/domain/free-tier/inapp-usage';
import {
  usageNavLevelFromCount,
  usageNavMobileWarningDot,
} from '~/domain/free-tier/usage-nav-meter';
import { UsageNavRing } from '~/components/free-tier/usage-nav-ring';
import type { SidebarNavLink } from '~/routes/app/sidebar-nav';
import { Lock } from 'lucide-react';
import { Tooltip } from '~/components/ui/tooltip';

export function freeTierNavMobileWarningDot(
  usage: FreeAccountUsage,
  loading: boolean
): boolean {
  if (!usage.usageNavMetersAvailable || loading) return false;
  const levels = [];
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
}) {
  const { link, usage, loading, navExpanded } = input;
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
      />
    );
  }

  if (link.to === '/app/reporter') {
    if (usage.reporterLocked || !usage.monthly) {
      return navExpanded ? (
        <Tooltip text="Unlocks after approval" contentProps={{ side: 'right' }}>
          <Lock size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        </Tooltip>
      ) : (
        <Lock size={14} className="shrink-0 text-muted-foreground" aria-hidden />
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
      />
    );
  }

  return null;
}
