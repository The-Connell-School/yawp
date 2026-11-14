import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { stackMarginCommentTops } from '../comments/margin-comment-layout';

type Props = {
  contentRoot: HTMLElement | null;
  scrollRoot: HTMLElement | null;
  commentIds: string[];
  children: (commentId: string, style: { top: number }) => ReactNode;
};

/**
 * Positions margin comment cards beside their highlight marks in the document
 * (per document-editor-states.html teacher view).
 */
export function DocumentMarginComments({
  contentRoot,
  scrollRoot,
  commentIds,
  children,
}: Props) {
  const asideRef = useRef<HTMLElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [anchorTops, setAnchorTops] = useState<Record<string, number>>({});
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    if (!contentRoot || !scrollRoot || !asideRef.current) {
      setAnchorTops({});
      return;
    }

    const measureAnchors = () => {
      const scrollRect = scrollRoot.getBoundingClientRect();
      const scrollTop = scrollRoot.scrollTop;
      const next: Record<string, number> = {};

      for (const id of commentIds) {
        const mark = contentRoot.querySelector<HTMLElement>(
          `.comment-mark[data-comment-id="${CSS.escape(id)}"]`
        );
        if (!mark) continue;
        const markRect = mark.getBoundingClientRect();
        const top = markRect.top - scrollRect.top + scrollTop;
        next[id] = Math.max(0, Math.round(top));
      }
      setAnchorTops(next);
    };

    measureAnchors();
    const ro = new ResizeObserver(measureAnchors);
    ro.observe(contentRoot);
    ro.observe(scrollRoot);
    scrollRoot.addEventListener('scroll', measureAnchors, { passive: true });
    window.addEventListener('resize', measureAnchors);

    return () => {
      ro.disconnect();
      scrollRoot.removeEventListener('scroll', measureAnchors);
      window.removeEventListener('resize', measureAnchors);
    };
  }, [contentRoot, scrollRoot, commentIds]);

  useLayoutEffect(() => {
    const measureHeights = () => {
      const next: Record<string, number> = {};
      for (const id of commentIds) {
        const node = cardRefs.current.get(id);
        if (node) next[id] = Math.round(node.offsetHeight);
      }
      setCardHeights(next);
    };

    measureHeights();
    const ro = new ResizeObserver(measureHeights);
    for (const id of commentIds) {
      const node = cardRefs.current.get(id);
      if (node) ro.observe(node);
    }
    return () => ro.disconnect();
  }, [commentIds, anchorTops]);

  const sortIds = [...commentIds]
    .filter((id) => anchorTops[id] !== undefined)
    .sort((a, b) => (anchorTops[a] ?? 0) - (anchorTops[b] ?? 0));
  const stackedTops = stackMarginCommentTops(sortIds, anchorTops, cardHeights);

  return (
    <aside
      ref={asideRef}
      aria-label="Comments"
      className="doc-editor-margin hidden lg:block"
    >
      {commentIds.map((id) => {
        const top = stackedTops[id] ?? anchorTops[id];
        if (top === undefined) return null;
        return (
          <div
            key={id}
            ref={(node) => {
              if (node) cardRefs.current.set(id, node);
              else cardRefs.current.delete(id);
            }}
            className="absolute left-0 w-[260px]"
            style={{ top }}
            data-margin-comment-for={id}
          >
            {children(id, { top })}
          </div>
        );
      })}
    </aside>
  );
}