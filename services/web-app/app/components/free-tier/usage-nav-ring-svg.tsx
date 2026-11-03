import { cn } from '~/utils/misc';
import type { UsageCount } from '~/domain/free-tier/inapp-usage';
import {
  usageNavLevelFromCount,
  usageNavShowsTerracotta,
  usagePercentLeft,
  type UsageNavLevel,
} from '~/domain/free-tier/usage-nav-meter';

export const USAGE_NAV_RING_STROKE = 2;
export const USAGE_NAV_RING_SIZE_EXPANDED = 18;
export const USAGE_NAV_RING_SIZE_COLLAPSED = 44;
export const USAGE_NAV_MOBILE_HIT_SIZE = 44;

export function usageNavRingGeometry(size: number) {
  const stroke = USAGE_NAV_RING_STROKE;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return { size, stroke, r, c };
}

export function UsageNavRingSvg({
  size = USAGE_NAV_RING_SIZE_EXPANDED,
  dash,
  terracotta,
  animate,
  reducedMotion,
  showArc = true,
  showTrack = true,
}: {
  size?: number;
  dash: number;
  terracotta: boolean;
  animate: boolean;
  reducedMotion: boolean;
  showArc?: boolean;
  showTrack?: boolean;
}) {
  const { stroke, r, c } = usageNavRingGeometry(size);
  const half = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(
        'pointer-events-none -rotate-90',
        animate && !reducedMotion && 'transition-all duration-[400ms] ease-out'
      )}
      aria-hidden
    >
      {showTrack ? (
        <circle
          cx={half}
          cy={half}
          r={r}
          fill="none"
          className="stroke-muted"
          strokeWidth={stroke}
        />
      ) : null}
      {showArc && dash > 0 ? (
        <circle
          cx={half}
          cy={half}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn(terracotta ? 'stroke-primary' : 'stroke-foreground')}
          strokeDasharray={`${dash} ${c}`}
        />
      ) : null}
    </svg>
  );
}

export function UsageNavRingMiniSvg({
  count,
  level,
  size = 16,
}: {
  count: UsageCount;
  level: UsageNavLevel;
  size?: number;
}) {
  const left = usagePercentLeft(count);
  const { c } = usageNavRingGeometry(size);
  const dash = (left / 100) * c;
  const terracotta = usageNavShowsTerracotta(level);
  return (
    <UsageNavRingSvg
      size={size}
      dash={level === 'all-used' ? 0 : dash}
      terracotta={terracotta}
      animate={false}
      reducedMotion
      showArc={level !== 'all-used'}
    />
  );
}

export function usageNavRingDash(
  count: UsageCount | undefined,
  level: UsageNavLevel,
  size: number,
  animatedPercent: number | null
): number {
  const { c } = usageNavRingGeometry(size);
  if (level === 'all-used') return 0;
  const percent =
    animatedPercent === null
      ? count
        ? usagePercentLeft(count)
        : 0
      : animatedPercent;
  return (Math.max(0, Math.min(100, percent)) / 100) * c;
}

export function usageNavLevelForCount(
  loading: boolean,
  count?: UsageCount
): UsageNavLevel {
  if (loading) return 'loading';
  if (!count) return 'hidden';
  return usageNavLevelFromCount(count);
}
