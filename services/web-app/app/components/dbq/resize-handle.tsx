import { useCallback } from 'react';
import { cn } from '~/utils/misc';

type Orientation = 'vertical' | 'horizontal';

export function ResizeHandle({
  orientation = 'vertical',
  onDrag,
  className,
  ariaLabel,
}: {
  orientation?: Orientation;
  onDrag: (deltaPx: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let last = orientation === 'vertical' ? e.clientX : e.clientY;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor =
        orientation === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      function move(ev: MouseEvent) {
        const pos = orientation === 'vertical' ? ev.clientX : ev.clientY;
        const delta = pos - last;
        last = pos;
        if (delta !== 0) onDrag(delta);
      }
      function up() {
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [orientation, onDrag]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 40 : 10;
      const keyDelta: Record<string, number> =
        orientation === 'vertical'
          ? { ArrowLeft: -step, ArrowRight: step }
          : { ArrowUp: -step, ArrowDown: step };
      const delta = keyDelta[e.key];
      if (!delta) return;
      e.preventDefault();
      onDrag(delta);
    },
    [orientation, onDrag]
  );

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onDrag(0)}
      className={cn(
        'group relative shrink-0 select-none bg-border transition-colors',
        orientation === 'vertical'
          ? 'w-px cursor-col-resize hover:bg-primary/40 active:bg-primary/60'
          : 'h-px cursor-row-resize hover:bg-primary/40 active:bg-primary/60',
        className
      )}
    >
      <div
        className={cn(
          'absolute',
          orientation === 'vertical'
            ? 'inset-y-0 -left-1.5 -right-1.5'
            : 'inset-x-0 -top-1.5 -bottom-1.5'
        )}
      />
    </div>
  );
}
