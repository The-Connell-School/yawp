import type { UsageCount } from './inapp-usage';
import { formatUsageRenewsLabel } from './inapp-usage';

export type UsageNavFeature = 'lesson-planner' | 'reporter';

export type UsageNavLevel =
  | 'plenty'
  | 'about-half'
  | 'few'
  | 'all-used'
  | 'loading'
  | 'hidden';

export function usagePercentLeft(count: UsageCount): number {
  if (count.total <= 0) return 0;
  return Math.round((count.remaining / count.total) * 100);
}

export function usagePercentUsed(count: UsageCount): number {
  if (count.total <= 0) return 0;
  return Math.round((count.used / count.total) * 100);
}

export function usageNavRenewsHeaderLabel(renewsAtIso: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(renewsAtIso));
  return `Renews ${date}`;
}

export function usageNavLevelFromCount(count: UsageCount): UsageNavLevel {
  const left = usagePercentLeft(count);
  if (left <= 0) return 'all-used';
  if (left <= 33) return 'few';
  if (left <= 66) return 'about-half';
  return 'plenty';
}

export function usageNavLevelLabel(level: UsageNavLevel): string {
  switch (level) {
    case 'plenty':
      return 'Plenty left';
    case 'about-half':
      return 'About half left';
    case 'few':
      return 'A few left';
    case 'all-used':
      return 'All used until next month';
    case 'loading':
      return 'Loading usage';
    default:
      return '';
  }
}

export function usageNavLevelHeadline(
  level: UsageNavLevel,
  renewsAtIso: string | undefined
): string {
  if (level === 'all-used' && renewsAtIso) {
    const renews = formatUsageRenewsLabel(renewsAtIso).replace(/^Renews /, '');
    return `All used until ${renews}`;
  }
  return usageNavLevelLabel(level);
}

export function usageNavFeatureLabel(feature: UsageNavFeature): string {
  return feature === 'lesson-planner' ? 'Lesson Planner' : 'Reporter';
}

/** Collapsed sidebar link label, e.g. "Lesson Planner, A few left". */
export function usageNavCollapsedAccessibleName(input: {
  feature: UsageNavFeature;
  count?: UsageCount;
  loading?: boolean;
}): string {
  const feature = usageNavFeatureLabel(input.feature);
  if (input.loading) return `${feature}, loading usage`;
  if (!input.count || input.count.total <= 0) return feature;
  const level = usageNavLevelFromCount(input.count);
  const levelPhrase =
    level === 'few'
      ? 'A few left'
      : level === 'about-half'
        ? 'About half left'
        : level === 'plenty'
          ? 'Plenty left'
          : level === 'all-used'
            ? 'All used this month'
            : feature;
  return `${feature}, ${levelPhrase}`;
}

export function usageNavAccessibleName(input: {
  feature: UsageNavFeature;
  count: UsageCount;
  renewsAtIso?: string;
}): string {
  const level = usageNavLevelFromCount(input.count);
  const feature = usageNavFeatureLabel(input.feature);
  const levelPhrase =
    level === 'few'
      ? 'a few left'
      : level === 'about-half'
        ? 'about half left'
        : level === 'plenty'
          ? 'plenty left'
          : level === 'all-used'
            ? 'none left this month'
            : 'loading';
  return `${feature}: ${levelPhrase}, ${input.count.remaining} of ${input.count.total} this month`;
}

export function usageNavShowsTerracotta(level: UsageNavLevel): boolean {
  return level === 'few';
}

export function usageNavProgressBarTerracotta(level: UsageNavLevel): boolean {
  return level === 'few' || level === 'all-used';
}

/** Short status copy for usage popover rows (renews live in the panel header). */
export function usageNavLevelPopoverStatus(level: UsageNavLevel): string {
  if (level === 'all-used') return 'All used';
  return usageNavLevelLabel(level);
}

export function usageNavMobileWarningDot(
  levels: UsageNavLevel[]
): boolean {
  return levels.some((level) => level === 'few');
}
