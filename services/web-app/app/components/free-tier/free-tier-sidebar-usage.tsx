import { ChartColumn, ChevronRight } from 'lucide-react';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import { lessonPlannerMonthlyUsage } from '~/domain/free-tier/inapp-usage';
import { usageNavLevelFromCount } from '~/domain/free-tier/usage-nav-meter';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { UsageNavMonthlyUsagePopover } from '~/components/free-tier/usage-nav-popover-body';
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
  const rows = [
    ...(showLessonPlanner
      ? [
          {
            feature: 'lesson-planner' as const,
            count: lessonPlannerMonthlyUsage(usage),
            level: usageNavLevelFromCount(lessonPlannerMonthlyUsage(usage)),
          },
        ]
      : []),
    ...(showReporter && usage.reporter
      ? [
          {
            feature: 'reporter' as const,
            count: usage.reporter,
            level: usageNavLevelFromCount(usage.reporter),
          },
        ]
      : []),
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block w-full border-0 bg-transparent p-0 text-inherit"
        >
          <div
            data-testid="free-tier-sidebar-usage"
            className={cn(
              'flex w-full items-center justify-between gap-2 border-t text-left text-sm text-foreground transition hover:bg-foreground/5',
              loading && 'opacity-60'
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ChartColumn
                size={18}
                className="size-[17px] shrink-0"
                aria-hidden
              />
              Usage
            </span>
            <ChevronRight
              size={16}
              className="shrink-0 text-muted-foreground"
              aria-hidden
            />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={10}
        collisionPadding={8}
        className="w-[185px] rounded-[10px] border-0 p-3 shadow-[0_8px_28px_rgba(15,23,42,0.12)]"
      >
        <UsageNavMonthlyUsagePopover renewsAtIso={renewsAt} rows={rows} />
      </PopoverContent>
    </Popover>
  );
}
