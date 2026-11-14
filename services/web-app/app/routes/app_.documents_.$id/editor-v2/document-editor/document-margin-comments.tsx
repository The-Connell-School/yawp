import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
  const [tops, setTops] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    if (!contentRoot || !scrollRoot || !asideRef.current) {
      setTops({});
      return;
    }

    const measure = () => {
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
      setTops(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(contentRoot);
    ro.observe(scrollRoot);
    scrollRoot.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      scrollRoot.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [contentRoot, scrollRoot, commentIds]);

  return (
    <aside
      ref={asideRef}
      aria-label="Comments"
      className="doc-editor-margin hidden lg:block"
    >
      {commentIds.map((id) => {
        const top = tops[id];
        if (top === undefined) return null;
        return (
          <div
            key={id}
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