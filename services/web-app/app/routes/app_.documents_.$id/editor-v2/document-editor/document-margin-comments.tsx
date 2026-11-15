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
    if (!contentRoot || !scrollRoot || !asideRef.current) return;
    const remeasure = () => {
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
    remeasure();
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(remeasure);
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf) cancelAnimationFrame(innerRaf);
    };
  }, [commentIds, contentRoot, scrollRoot]);

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

  const anchoredIds = [...commentIds]
    .filter((id) => anchorTops[id] !== undefined)
    .sort((a, b) => (anchorTops[a] ?? 0) - (anchorTops[b] ?? 0));
  const orphanIds = commentIds.filter((id) => anchorTops[id] === undefined);
  const stackedAnchored = stackMarginCommentTops(
    anchoredIds,
    anchorTops,
    cardHeights
  );
  let orphanCursor = anchoredIds.reduce(
    (cursor, id) =>
      Math.max(
        cursor,
        (stackedAnchored[id] ?? anchorTops[id] ?? 0) +
          (cardHeights[id] ?? 0) +
          8
      ),
    8
  );
  const stackedOrphans: Record<string, number> = {};
  for (const id of orphanIds) {
    const height = cardHeights[id] ?? 0;
    stackedOrphans[id] = orphanCursor;
    orphanCursor += height + 8;
  }
  const stackedTops = { ...stackedAnchored, ...stackedOrphans };

  return (
    <aside
      ref={asideRef}
      aria-label="Comments"
      className="doc-editor-margin"
      data-testid="document-margin-comments-aside"
    >
      {commentIds.map((id) => {
        const top = stackedTops[id] ?? 8;
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