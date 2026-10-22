import * as SheetPrimitive from '@radix-ui/react-dialog';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '~/utils/misc';
import type { UsageCount } from '~/domain/free-tier/inapp-usage';
import {
  usageNavFeatureLabel,
  usageNavLevelFromCount,
  type UsageNavFeature,
} from '~/domain/free-tier/usage-nav-meter';
import { UsageNavPopoverBody } from '~/components/free-tier/usage-nav-popover-body';

type UsageNavMobileSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: UsageNavFeature;
  count: UsageCount;
  renewsAtIso?: string;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
};

export function UsageNavMobileSheet({
  open,
  onOpenChange,
  feature,
  count,
  renewsAtIso,
  returnFocusRef,
}: UsageNavMobileSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragOffset = useRef(0);
  const [dragPx, setDragPx] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!open) {
      setDragPx(0);
      dragOffset.current = 0;
    }
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    dragStartY.current = event.clientY;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (dragStartY.current === null) return;
    const delta = Math.max(0, event.clientY - dragStartY.current);
    dragOffset.current = delta;
    setDragPx(delta);
  };

  const onPointerUp = () => {
    if (dragStartY.current === null) return;
    const height = sheetRef.current?.offsetHeight ?? 300;
    if (dragOffset.current > height / 3) close();
    dragStartY.current = null;
    dragOffset.current = 0;
    setDragPx(0);
  };

  const level = usageNavLevelFromCount(count);

  if (!open) return null;

  return (
    <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-[60] bg-black/40',
            reducedMotion
              ? 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-150 data-[state=closed]:duration-150'
              : 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-200 data-[state=closed]:duration-200'
          )}
        />
        <SheetPrimitive.Content
          ref={sheetRef}
          aria-modal
          aria-labelledby={titleId}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          onEscapeKeyDown={close}
          onPointerDownOutside={close}
          className={cn(
            'fixed inset-x-0 bottom-0 z-[61] rounded-t-2xl border-t bg-background px-4 pb-6 pt-3 shadow-lg outline-none',
            reducedMotion
              ? 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-150 data-[state=closed]:duration-150'
              : 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-[220ms] data-[state=open]:ease-out data-[state=closed]:duration-[160ms]'
          )}
          style={
            dragPx > 0 && !reducedMotion
              ? { transform: `translateY(${dragPx}px)` }
              : undefined
          }
          data-testid={`usage-nav-mobile-sheet-${feature}`}
        >
          <div
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden
            data-testid="usage-nav-sheet-grab"
          />
          <div className="mb-3 flex items-center justify-between gap-2">
            <SheetPrimitive.Title id={titleId} className="text-sm font-medium">
              {usageNavFeatureLabel(feature)}
            </SheetPrimitive.Title>
            <SheetPrimitive.Close
              type="button"
              className="text-sm font-medium text-primary"
              data-testid="usage-nav-sheet-close"
            >
              Close
            </SheetPrimitive.Close>
          </div>
          <UsageNavPopoverBody
            feature={feature}
            count={count}
            level={level}
            renewsAtIso={renewsAtIso}
            showFeatureLabel={false}
          />
        </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
