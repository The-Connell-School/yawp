import { Link } from 'react-router';
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
  usageNavCollapsedAccessibleName,
  usageNavShowsTerracotta,
  usagePercentLeft,
  type UsageNavFeature,
} from '~/domain/free-tier/usage-nav-meter';
import { UsageNavPopoverBody } from '~/components/free-tier/usage-nav-popover-body';
import {
  USAGE_NAV_RING_SIZE_COLLAPSED,
  UsageNavRingSvg,
  usageNavLevelForCount,
  usageNavRingDash,
} from '~/components/free-tier/usage-nav-ring-svg';
import { handleUsageNavPopoverKeyDown } from '~/components/free-tier/usage-nav-keyboard';

type HoverTimer = ReturnType<typeof setTimeout>;

type UsageNavCollapsedLinkProps = {
  to: string;
  feature: UsageNavFeature;
  icon: React.ReactNode;
  count?: UsageCount;
  renewsAtIso?: string;
  loading?: boolean;
  isActive?: boolean;
  reloadDocument?: boolean;
  className?: string;
};

export function UsageNavCollapsedLink({
  to,
  feature,
  icon,
  count,
  renewsAtIso,
  loading = false,
  isActive,
  reloadDocument,
  className,
}: UsageNavCollapsedLinkProps) {
  const [open, setOpen] = useState(false);
  const [animatedPercent, setAnimatedPercent] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const openTimer = useRef<HoverTimer | null>(null);
  const closeTimer = useRef<HoverTimer | null>(null);
  const talkToUsRef = useRef<HTMLAnchorElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const popoverId = useId();

  const level = usageNavLevelForCount(loading, count);
  const targetPercent = loading || !count ? 0 : usagePercentLeft(count);
  const showRing = loading || Boolean(count && count.total > 0);
  const terracotta = !loading && usageNavShowsTerracotta(level);
  const dash = usageNavRingDash(count, level, USAGE_NAV_RING_SIZE_COLLAPSED, animatedPercent);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setAnimatedPercent(targetPercent);
  }, [targetPercent]);

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

  const ariaLabel = loading
    ? usageNavCollapsedAccessibleName({ feature, loading: true })
    : count
      ? usageNavCollapsedAccessibleName({ feature, count })
      : usageNavCollapsedAccessibleName({ feature });

  const onKeyDown = (event: KeyboardEvent) => {
    handleUsageNavPopoverKeyDown(event, {
      open,
      focusTalkToUs: () => talkToUsRef.current?.focus(),
      closePopover: () => setOpen(false),
      refocusTrigger: () => linkRef.current?.focus(),
    });
  };

  const onFocus = () => {
    clearTimers();
    setOpen(true);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={loading ? undefined : scheduleOpen}
      onMouseLeave={loading ? undefined : scheduleClose}
    >
      {loading ? (
        <span role="status" aria-live="polite" className="sr-only">
          Loading usage
        </span>
      ) : null}
      <Link
        ref={linkRef}
        to={to}
        reloadDocument={reloadDocument}
        aria-current={isActive ? 'page' : undefined}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-haspopup="dialog"
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        className={cn(
          'relative flex size-11 shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        data-testid={`usage-nav-collapsed-link-${feature}`}
      >
        {showRing ? (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <UsageNavRingSvg
              size={USAGE_NAV_RING_SIZE_COLLAPSED}
              dash={level === 'all-used' ? 0 : dash}
              terracotta={terracotta}
              animate={!loading}
              reducedMotion={reducedMotion}
              showArc={level !== 'all-used'}
              showTrack
            />
          </span>
        ) : null}
        <span className="relative z-[1]">{icon}</span>
      </Link>
      {open && !loading && count ? (
        <div
          id={popoverId}
          role="dialog"
          className={cn(
            'absolute left-full top-1/2 z-50 ml-2 w-[min(280px,calc(100vw-24px))] -translate-y-1/2 rounded-xl border bg-popover p-4 text-sm shadow-md',
            'animate-in fade-in duration-150',
            !reducedMotion && 'slide-in-from-left-1'
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
