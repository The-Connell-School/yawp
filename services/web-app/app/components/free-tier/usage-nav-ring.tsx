import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { cn } from '~/utils/misc';
import type { UsageCount } from '~/domain/free-tier/inapp-usage';
import {
  usageNavAccessibleName,
  usageNavLevelFromCount,
  usageNavLevelHeadline,
  usageNavPopoverDetail,
  usageNavShowsTerracotta,
  usagePercentLeft,
  type UsageNavFeature,
  type UsageNavLevel,
} from '~/domain/free-tier/usage-nav-meter';
import { FULL_ACCESS_CONTACT } from '~/components/free-account-usage';

const RING_SIZE = 18;
const STROKE = 2;
const R = (RING_SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
type HoverTimer = ReturnType<typeof setTimeout>;

type UsageNavRingProps = {
  feature: UsageNavFeature;
  count?: UsageCount;
  renewsAtIso?: string;
  loading?: boolean;
  hidden?: boolean;
  popoverAlign?: 'start' | 'end';
  className?: string;
};

export function usageNavRingVisible(input: {
  hidden?: boolean;
  loading?: boolean;
  count?: UsageCount;
}): boolean {
  if (input.hidden) return false;
  if (input.loading) return true;
  return Boolean(input.count && input.count.total > 0);
}

export function UsageNavRing({
  feature,
  count,
  renewsAtIso,
  loading = false,
  hidden = false,
  popoverAlign = 'end',
  className,
}: UsageNavRingProps) {
  const [open, setOpen] = useState(false);
  const [animatedPercent, setAnimatedPercent] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const mounted = useRef(false);
  const openTimer = useRef<HoverTimer | null>(null);
  const closeTimer = useRef<HoverTimer | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const level: UsageNavLevel = loading
    ? 'loading'
    : count
      ? usageNavLevelFromCount(count)
      : 'hidden';
  const targetPercent = loading || !count ? 0 : usagePercentLeft(count);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setAnimatedPercent(targetPercent);
      return;
    }
    if (reducedMotion) {
      setAnimatedPercent(targetPercent);
      return;
    }
    setAnimatedPercent(targetPercent);
  }, [targetPercent, reducedMotion]);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), 300);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (hidden || (!loading && (!count || count.total <= 0))) {
    return null;
  }

  const terracotta = !loading && usageNavShowsTerracotta(level);
  const dash =
    animatedPercent === null
      ? 0
      : (Math.max(0, Math.min(100, animatedPercent)) / 100) * C;
  const ariaLabel = loading
    ? 'Loading usage'
    : count
      ? usageNavAccessibleName({ feature, count, renewsAtIso })
      : 'Usage';

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      onMouseEnter={loading ? undefined : scheduleOpen}
      onMouseLeave={loading ? undefined : scheduleClose}
    >
      {loading ? (
        <span role="status" aria-live="polite" className="sr-only">
          Loading usage
        </span>
      ) : null}
      {loading ? (
        <span
          className="inline-flex items-center justify-center"
          aria-hidden
          data-testid={`usage-nav-ring-${feature}`}
        >
          <UsageNavRingSvg
            dash={0}
            terracotta={false}
            animate={false}
            reducedMotion
          />
        </span>
      ) : (
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby={open ? labelId : undefined}
        className="inline-flex items-center justify-center rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onKeyDown}
        data-testid={`usage-nav-ring-${feature}`}
      >
        <UsageNavRingSvg
          dash={level === 'all-used' ? 0 : dash}
          terracotta={terracotta}
          animate
          reducedMotion={reducedMotion}
          showArc={level !== 'all-used'}
        />
      </button>
      )}
      {open && !loading && count ? (
        <div
          ref={popoverRef}
          role="dialog"
          id={labelId}
          className={cn(
            'absolute z-50 w-[min(280px,calc(100vw-24px))] rounded-xl border bg-popover p-4 text-sm shadow-md',
            'animate-in fade-in duration-150',
            !reducedMotion && 'slide-in-from-left-1',
            popoverAlign === 'end' ? 'left-full top-1/2 ml-2 -translate-y-1/2' : 'right-full top-1/2 mr-2 -translate-y-1/2',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:duration-100',
            reducedMotion && 'data-[state=closed]:slide-in-from-left-0'
          )}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          data-testid={`usage-nav-popover-${feature}`}
        >
          <p className="flex items-center gap-2 font-semibold">
            <UsageNavRingMini
              count={count}
              level={level}
              loading={false}
            />
            {usageNavLevelHeadline(level, renewsAtIso)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {usageNavPopoverDetail({ feature, count, renewsAtIso })}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Unlimited with a site license.{' '}
            <a href={FULL_ACCESS_CONTACT} className="text-primary underline">
              Talk to us
            </a>
          </p>
        </div>
      ) : null}
    </span>
  );
}

function UsageNavRingSvg({
  dash,
  terracotta,
  animate,
  reducedMotion,
  showArc = true,
}: {
  dash: number;
  terracotta: boolean;
  animate: boolean;
  reducedMotion: boolean;
  showArc?: boolean;
}) {
  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className={cn(
        '-rotate-90',
        animate && !reducedMotion && 'transition-all duration-[400ms] ease-out'
      )}
      aria-hidden
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={R}
        fill="none"
        className="stroke-muted"
        strokeWidth={STROKE}
      />
      {showArc && dash > 0 ? (
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          className={cn(terracotta ? 'stroke-primary' : 'stroke-foreground')}
          strokeDasharray={`${dash} ${C}`}
        />
      ) : null}
    </svg>
  );
}

function UsageNavRingMini({
  count,
  level,
  loading,
}: {
  count: UsageCount;
  level: UsageNavLevel;
  loading: boolean;
}) {
  const left = usagePercentLeft(count);
  const dash = (left / 100) * C;
  const terracotta = usageNavShowsTerracotta(level);
  return (
    <svg
      width={16}
      height={16}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className="-rotate-90 shrink-0"
      aria-hidden
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={R}
        fill="none"
        className="stroke-muted"
        strokeWidth={STROKE}
      />
      {!loading && level !== 'all-used' ? (
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          className={cn(terracotta ? 'stroke-primary' : 'stroke-foreground')}
          strokeDasharray={`${dash} ${C}`}
        />
      ) : null}
    </svg>
  );
}
