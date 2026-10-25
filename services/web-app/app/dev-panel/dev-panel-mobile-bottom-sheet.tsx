import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import { cn } from '~/utils/misc';
import { decideBottomSheetDismiss } from './dev-panel-bottom-sheet-dismiss';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed?: () => void;
  children: ReactNode;
  className?: string;
};

export function DevPanelMobileBottomSheet({
  open,
  onOpenChange,
  onClosed,
  children,
  className,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const lastMoveDeltaY = useRef(0);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      setDragOffsetPx(0);
      setDragging(false);
    }
  }, [open]);

  const finishDrag = useCallback(() => {
    const sheetHeight = contentRef.current?.getBoundingClientRect().height ?? 0;
    const decision = decideBottomSheetDismiss({
      dragOffsetPx,
      sheetHeightPx: sheetHeight,
      lastMoveDeltaY: lastMoveDeltaY.current,
    });
    setDragging(false);
    dragStartY.current = null;
    previousPointerY.current = null;
    lastMoveDeltaY.current = 0;
    if (decision.action === 'close') {
      setDragOffsetPx(0);
      onOpenChange(false);
      onClosed?.();
      return;
    }
    setDragOffsetPx(0);
  }, [dragOffsetPx, onClosed, onOpenChange]);

  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartY.current = event.clientY;
    previousPointerY.current = event.clientY;
    lastMoveDeltaY.current = 0;
    setDragging(true);
  };

  const previousPointerY = useRef<number | null>(null);

  const onHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const delta = Math.max(0, event.clientY - dragStartY.current);
    if (previousPointerY.current != null) {
      lastMoveDeltaY.current = event.clientY - previousPointerY.current;
    }
    previousPointerY.current = event.clientY;
    setDragOffsetPx(delta);
  };

  const onHandlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishDrag();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        side="bottom"
        showCloseButton={false}
        className={cn(
          'yawp-dev-panel-mobile-sheet flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl border-t p-0',
          'h-auto data-[state=open]:duration-180 data-[state=closed]:duration-180',
          className
        )}
        style={{
          transform:
            dragOffsetPx > 0
              ? `translateY(${dragOffsetPx}px)`
              : undefined,
          transition: dragging ? 'none' : undefined,
        }}
        data-yawp-dev-panel
        data-yawp-dev-panel-ready="true"
        id="devtools"
        role="dialog"
        aria-modal
      >
        <div
          className="flex shrink-0 cursor-grab flex-col items-center px-4 pt-2 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div
            className="h-1 w-10 rounded-full bg-muted-foreground/40"
            aria-hidden="true"
          />
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}
