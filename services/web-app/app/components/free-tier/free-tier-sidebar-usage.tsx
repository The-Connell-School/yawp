import { ChevronRight } from 'lucide-react';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import { lessonPlannerMonthlyUsage } from '~/domain/free-tier/inapp-usage';
import { usageNavLevelFromCount } from '~/domain/free-tier/usage-nav-meter';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { UsageNavPopoverBody } from '~/components/free-tier/usage-nav-popover-body';
import { cn } from '~/utils/misc';

export function FreeTierSidebarUsage({
  usage,
  navExpanded,
  loading,
}: {
  usage: FreeAccountUsage;
  navExpanded: boolean;
  loading: boolean;
}) {
  if (!navExpanded) return null;

  const showLessonPlanner =
    usage.lessonPlannerMonthlyMetering || usage.monthly;
  const showReporter = Boolean(usage.monthly && usage.reporter);
  if (!showLessonPlanner && !showReporter) return null;

  const renewsAt = usage.renewsAt;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="free-tier-sidebar-usage"
          className={cn(
            'flex w-full items-center justify-between gap-2 border-t text-left text-sm font-medium text-foreground transition hover:bg-foreground/5',
            loading && 'opacity-60'
          )}
        >
          <span>Usage</span>
          <ChevronRight
            size={16}
            className="shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        collisionPadding={8}
        className="w-72 space-y-4 p-4"
      >
        {showLessonPlanner ? (
          <UsageNavPopoverBody
            feature="lesson-planner"
            count={lessonPlannerMonthlyUsage(usage)}
            level={usageNavLevelFromCount(lessonPlannerMonthlyUsage(usage))}
            renewsAtIso={renewsAt}
          />
        ) : null}
        {showReporter && usage.reporter ? (
          <UsageNavPopoverBody
            feature="reporter"
            count={usage.reporter}
            level={usageNavLevelFromCount(usage.reporter)}
            renewsAtIso={renewsAt}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
