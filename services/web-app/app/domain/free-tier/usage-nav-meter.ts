import type { FreeAccountUsage, UsageCount } from './inapp-usage';
import { lessonPlannerMonthlyUsage } from './inapp-usage';

/**
 * Meter A: the sidebar "Usage" row and its "Usage this month" popover
 * (Claude Design, Nov 2 2026). Plain words and line bars only, no rings and
 * no N-of-N counters. The bar shows what is left, so it empties as it is used.
 */
export type UsageMeterFeature = 'lesson-planner' | 'reporter';
export type UsageMeterLevel = 'plenty' | 'few' | 'all-used';

export type UsageMeterRow = {
  feature: UsageMeterFeature;
  label: string;
  level: UsageMeterLevel;
  status: string;
  /** Width of the bar, 0-100: the share still left this month. */
  percentLeft: number;
};

export function usageMeterPercentLeft(count: UsageCount): number {
  if (count.total <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((count.remaining / count.total) * 100))
  );
}

export function usageMeterLevel(count: UsageCount): UsageMeterLevel {
  if (count.total <= 0 || count.remaining <= 0) return 'all-used';
  // One use left is "a few" even on small caps (Reporter is 2 a month).
  if (count.remaining <= 1 || usageMeterPercentLeft(count) <= 33) return 'few';
  return 'plenty';
}

export function usageMeterStatus(level: UsageMeterLevel): string {
  switch (level) {
    case 'all-used':
      return 'All used';
    case 'few':
      return 'A few left';
    default:
      return 'Plenty left';
  }
}

/** "Renews Dec 1": first day of next month, read in UTC like the quota window. */
export function usageMeterRenewsLabel(renewsAtIso: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(renewsAtIso));
  return `Renews ${date}`;
}

function row(
  feature: UsageMeterFeature,
  label: string,
  count: UsageCount
): UsageMeterRow {
  const level = usageMeterLevel(count);
  return {
    feature,
    label,
    level,
    status: usageMeterStatus(level),
    percentLeft: usageMeterPercentLeft(count),
  };
}

/**
 * Rows for the free-tier sidebar meter. Lesson Planner only shows when the
 * teacher can open Lesson Planner (its flag is on), so the meter never counts
 * a tool they cannot reach. Reporter shows once monthly metering is on.
 */
export function usageMeterRows(
  usage: FreeAccountUsage,
  { lessonPlannerAvailable }: { lessonPlannerAvailable: boolean }
): UsageMeterRow[] {
  const rows: UsageMeterRow[] = [];
  if (
    lessonPlannerAvailable &&
    (usage.monthly || usage.lessonPlannerMonthlyMetering)
  ) {
    rows.push(
      row('lesson-planner', 'Lesson Planner', lessonPlannerMonthlyUsage(usage))
    );
  }
  if (usage.monthly && usage.reporter && !usage.reporterLocked) {
    rows.push(row('reporter', 'Reporter', usage.reporter));
  }
  return rows;
}
