import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPasteEventRanges } from './provenance';

type Rect = { left: number; top: number; width: number; height: number };
type HighlightRange = { text: string; rects: Rect[] };

function visibleClip(root: HTMLElement) {
  let left = 0,
    top = 0,
    right = window.innerWidth,
    bottom = window.innerHeight;
  for (
    let element: HTMLElement | null = root;
    element;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.overflowX !== 'visible') {
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }
    if (style.overflowY !== 'visible') {
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
  }
  return { left, top, right, bottom };
}

/** Paint over the document without writing into its DOM or persisted content.
 * Scroll/resize re-measurement keeps the overlay aligned with surviving ranges.
 */
export function PasteHighlightOverlay({
  contentRoot,
  eventId,
}: {
  contentRoot: HTMLElement | null;
  eventId: string | null;
}) {
  const [ranges, setRanges] = useState<HighlightRange[]>([]);
  useEffect(() => {
    if (!contentRoot || !eventId) {
      setRanges([]);
      return;
    }
    let frame: number | undefined;
    const update = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const clip = visibleClip(contentRoot);
        setRanges(
          getPasteEventRanges(contentRoot, eventId).map((range) => ({
            text: range.toString(),
            rects: Array.from(range.getClientRects())
              .map((rect) => {
                const left = Math.max(rect.left, clip.left),
                  top = Math.max(rect.top, clip.top);
                return {
                  left,
                  top,
                  width: Math.min(rect.right, clip.right) - left,
                  height: Math.min(rect.bottom, clip.bottom) - top,
                };
              })
              .filter((rect) => rect.width > 0 && rect.height > 0),
          }))
        );
      });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(contentRoot, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(contentRoot);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [contentRoot, eventId]);
  if (!contentRoot || !eventId) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none print:hidden"
      data-testid="paste-highlights"
    >
      {ranges.map((range, index) => (
        <div
          key={index}
          data-testid="paste-highlight-range"
          data-range-text={range.text}
        >
          {range.rects.map((rect, rectIndex) => (
            <div
              key={rectIndex}
              data-testid="paste-highlight"
              className="pointer-events-none fixed z-20 rounded-sm border border-red-600 bg-red-400/30"
              style={rect}
            />
          ))}
        </div>
      ))}
    </div>,
    contentRoot.ownerDocument.body
  );
}
