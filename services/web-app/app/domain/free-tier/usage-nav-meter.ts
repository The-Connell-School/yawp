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

export function usageNavPopoverDetail(input: {
  feature: UsageNavFeature;
  count: UsageCount;
  renewsAtIso?: string;
}): string {
  const left = usagePercentLeft(input.count);
  const renews =
    input.renewsAtIso != null
      ? formatUsageRenewsLabel(input.renewsAtIso).replace(/^Renews /, 'Renews ')
      : '';
  const parts = [
    usageNavFeatureLabel(input.feature),
    `${left}% left`,
    renews,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function usageNavShowsTerracotta(level: UsageNavLevel): boolean {
  return level === 'few';
}

export function usageNavMobileWarningDot(
  levels: UsageNavLevel[]
): boolean {
  return levels.some((level) => level === 'few');
}
