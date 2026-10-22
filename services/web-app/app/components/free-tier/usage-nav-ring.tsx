import * as SheetPrimitive from '@radix-ui/react-dialog';
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
  usageNavShowsTerracotta,
  usagePercentLeft,
  type UsageNavFeature,
} from '~/domain/free-tier/usage-nav-meter';
import { UsageNavPopoverBody } from '~/components/free-tier/usage-nav-popover-body';
import { UsageNavMobileSheet } from '~/components/free-tier/usage-nav-mobile-sheet';
import {
  USAGE_NAV_MOBILE_HIT_SIZE,
  USAGE_NAV_RING_SIZE_EXPANDED,
  UsageNavRingSvg,
  usageNavLevelForCount,
  usageNavRingDash,
} from '~/components/free-tier/usage-nav-ring-svg';
import { handleUsageNavPopoverKeyDown } from '~/components/free-tier/usage-nav-keyboard';

type HoverTimer = ReturnType<typeof setTimeout>;

export type UsageNavRingVariant = 'expanded-trailing' | 'mobile-drawer';

type UsageNavRingProps = {
  feature: UsageNavFeature;
  count?: UsageCount;
  renewsAtIso?: string;
  loading?: boolean;
  hidden?: boolean;
  variant?: UsageNavRingVariant;
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
  variant = 'expanded-trailing',
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
  const talkToUsRef = useRef<HTMLAnchorElement>(null);
  const labelId = useId();

  const level = usageNavLevelForCount(loading, count);
  const targetPercent = loading || !count ? 0 : usagePercentLeft(count);
  const isMobile = variant === 'mobile-drawer';

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
    setAnimatedPercent(targetPercent);
  }, [targetPercent]);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const scheduleOpen = useCallback(() => {
    if (isMobile) return;
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), 300);
  }, [clearTimers, isMobile]);

  const scheduleClose = useCallback(() => {
    if (isMobile) return;
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  }, [clearTimers, isMobile]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (hidden || (!loading && (!count || count.total <= 0))) {
    return null;
  }

  const terracotta = !loading && usageNavShowsTerracotta(level);
  const dash = usageNavRingDash(
    count,
    level,
    USAGE_NAV_RING_SIZE_EXPANDED,
    animatedPercent
  );
  const ariaLabel = loading
    ? 'Loading usage'
    : count
      ? usageNavAccessibleName({ feature, count, renewsAtIso })
      : 'Usage';

  const onKeyDown = (event: KeyboardEvent) => {
    if (isMobile) return;
    handleUsageNavPopoverKeyDown(event, {
      open,
      focusTalkToUs: () => talkToUsRef.current?.focus(),
      closePopover: () => setOpen(false),
      refocusTrigger: () => triggerRef.current?.focus(),
    });
  };

  const ringVisual = loading ? (
    <UsageNavRingSvg
      size={USAGE_NAV_RING_SIZE_EXPANDED}
      dash={0}
      terracotta={false}
      animate={false}
      reducedMotion
    />
  ) : (
    <UsageNavRingSvg
      size={USAGE_NAV_RING_SIZE_EXPANDED}
      dash={level === 'all-used' ? 0 : dash}
      terracotta={terracotta}
      animate
      reducedMotion={reducedMotion}
      showArc={level !== 'all-used'}
    />
  );

  if (isMobile) {
    return (
      <SheetPrimitive.Root open={open} onOpenChange={setOpen}>
        {loading ? (
          <span role="status" aria-live="polite" className="sr-only">
            Loading usage
          </span>
        ) : null}
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup={loading ? undefined : 'dialog'}
          aria-expanded={loading ? undefined : open}
          disabled={loading}
          className={cn(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
          onClick={loading ? undefined : () => setOpen(true)}
          data-testid={`usage-nav-ring-${feature}`}
        >
          {ringVisual}
        </button>
        {!loading && count ? (
          <UsageNavMobileSheet
            open={open}
            onOpenChange={setOpen}
            feature={feature}
            count={count}
            renewsAtIso={renewsAtIso}
            returnFocusRef={triggerRef}
          />
        ) : null}
      </SheetPrimitive.Root>
    );
  }

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
          {ringVisual}
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
          {ringVisual}
        </button>
      )}
      {open && !loading && count ? (
        <div
          role="dialog"
          id={labelId}
          className={cn(
            'absolute z-50 w-[min(280px,calc(100vw-24px))] rounded-xl border bg-popover p-4 text-sm shadow-md',
            'animate-in fade-in duration-150',
            !reducedMotion && 'slide-in-from-left-1',
            popoverAlign === 'end'
              ? 'left-full top-1/2 ml-2 -translate-y-1/2'
              : 'right-full top-1/2 mr-2 -translate-y-1/2',
            reducedMotion && 'data-[state=closed]:slide-in-from-left-0'
          )}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          data-testid={`usage-nav-popover-${feature}`}
        >
          <UsageNavPopoverBody
            feature={feature}
            count={count}
            level={level}
            renewsAtIso={renewsAtIso}
            talkToUsRef={talkToUsRef}
          />
        </div>
      ) : null}
    </span>
  );
}

export { USAGE_NAV_MOBILE_HIT_SIZE };
