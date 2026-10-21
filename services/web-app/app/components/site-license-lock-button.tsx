import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { SITE_LICENSE_UNAVAILABLE_REASON } from '~/domain/free-tier/site-license-message';
import useBreakpoint from '~/hooks/useBreakpoint';
import { cn } from '~/utils/misc';

export const SITE_LICENSE_LOCK_ARIA_LABEL = 'Available with a site license';

type SiteLicenseLockButtonProps = {
  className?: string;
  iconClassName?: string;
};

export function SiteLicenseLockButton({
  className,
  iconClassName,
}: SiteLicenseLockButtonProps) {
  const tooltipId = useId();
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'base' || breakpoint === 'sm';
  const [mobileOpen, setMobileOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const closeMobileTip = useCallback(() => {
    clearHideTimer();
    setMobileOpen(false);
  }, [clearHideTimer]);

  const openMobileTip = useCallback(() => {
    clearHideTimer();
    setMobileOpen(true);
    hideTimerRef.current = setTimeout(() => {
      setMobileOpen(false);
      hideTimerRef.current = null;
    }, 2000);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target)) return;
      closeMobileTip();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [closeMobileTip, isMobile, mobileOpen]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const button = (
    <button
      ref={buttonRef}
      type="button"
      data-testid="site-license-lock-button"
      className={cn(
        'shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      aria-label={SITE_LICENSE_LOCK_ARIA_LABEL}
      aria-describedby={mobileOpen || !isMobile ? tooltipId : undefined}
      onClick={(event) => {
        if (!isMobile) return;
        event.preventDefault();
        event.stopPropagation();
        if (mobileOpen) closeMobileTip();
        else openMobileTip();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (mobileOpen) {
            event.preventDefault();
            closeMobileTip();
          }
        }
      }}
    >
      <Lock size={16} className={cn('h-4 w-4', iconClassName)} aria-hidden />
    </button>
  );

  if (isMobile) {
    return (
      <span className="relative inline-flex">
        {button}
        {mobileOpen ? (
          <span
            id={tooltipId}
            role="tooltip"
            className="absolute bottom-full right-0 z-[200] mb-1 w-max max-w-[14rem] rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
          >
            {SITE_LICENSE_UNAVAILABLE_REASON}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipPrimitive.Portal>
          <TooltipContent
            id={tooltipId}
            side="top"
            className="z-[200]"
            onEscapeKeyDown={() => undefined}
          >
            {SITE_LICENSE_UNAVAILABLE_REASON}
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </TooltipRoot>
    </TooltipProvider>
  );
}
