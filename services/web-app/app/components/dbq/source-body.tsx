import { useRef } from 'react';
import { buildSegments, clampOffsets } from './marks';
import type { TextMark } from './types';
import { cn } from '~/utils/misc';

export type SelectRange = { start: number; end: number; quote: string };

/**
 * Map a DOM selection point (a text node + local offset) to an absolute
 * character offset in the source body, using the `data-seg-start` marker that
 * every rendered segment span carries. Returns null when the point falls
 * outside the rendered body.
 */
export function pointToOffset(
  root: HTMLElement,
  node: Node | null,
  offset: number
): number | null {
  let el: Node | null =
    node && node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (
    el &&
    el !== root &&
    (el as HTMLElement).dataset?.segStart === undefined
  ) {
    el = (el as HTMLElement).parentElement;
  }
  const segStart = (el as HTMLElement | null)?.dataset?.segStart;
  if (!el || el === root || segStart === undefined) return null;
  return Number(segStart) + offset;
}

export function SourceBody({
  body,
  marks,
  onSelect,
  activeMarkId,
  onClickMark,
  className,
}: {
  body: string;
  marks: TextMark[];
  onSelect: (range: SelectRange) => void;
  activeMarkId?: string | null;
  onClickMark?: (id: string) => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLParagraphElement | null>(null);
  const segments = buildSegments(body.length, marks);

  function handleSelection() {
    const root = rootRef.current;
    const selection =
      typeof window !== 'undefined' ? window.getSelection() : null;
    if (
      !root ||
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed
    ) {
      return;
    }
    const a = pointToOffset(root, selection.anchorNode, selection.anchorOffset);
    const b = pointToOffset(root, selection.focusNode, selection.focusOffset);
    if (a === null || b === null) return;
    const range = clampOffsets(body.length, a, b);
    if (!range) return;
    onSelect({
      ...range,
      quote: body.slice(range.start, range.end),
    });
  }

  return (
    <p
      ref={rootRef}
      data-source-body=""
      onMouseUp={handleSelection}
      className={cn(
        'whitespace-pre-line text-[13px] leading-relaxed text-foreground/90',
        className
      )}
    >
      {segments.map((seg) => {
        const text = body.slice(seg.start, seg.end);
        if (seg.markIds.length === 0) {
          return (
            <span key={seg.start} data-seg-start={seg.start}>
              {text}
            </span>
          );
        }
        const isHighlight = seg.kinds.includes('highlight');
        const isUnderline = seg.kinds.includes('underline');
        const isActive =
          activeMarkId != null && seg.markIds.includes(activeMarkId);
        const primaryMarkId = seg.markIds[seg.markIds.length - 1];
        return (
          <span
            key={seg.start}
            data-seg-start={seg.start}
            data-mark-kind={seg.kinds.join(' ')}
            role="button"
            tabIndex={0}
            onClick={() => onClickMark?.(primaryMarkId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClickMark?.(primaryMarkId);
              }
            }}
            className={cn(
              'cursor-pointer rounded-[2px] transition-colors',
              isHighlight && 'bg-yellow-200/70 hover:bg-yellow-200',
              isUnderline &&
                'underline decoration-primary decoration-2 underline-offset-2',
              isActive && 'ring-2 ring-primary/50'
            )}
          >
            {text}
          </span>
        );
      })}
    </p>
  );
}
