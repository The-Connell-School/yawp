import { useEffect, useRef } from 'react';
import { findExcerptRange } from '~/utils/excerpt-position';

export type GradeHighlight = {
  id: string;
  excerpt: string | null;
  occurrence?: number | null;
  dataAttr?: 'data-grade-comment-id' | 'data-grammar-issue-id';
  className?: string;
};

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function getTextNodes(root: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((current = walker.nextNode())) {
    if (isTextNode(current)) nodes.push(current);
  }
  return nodes;
}

function resolveTextBoundary(root: HTMLElement, absoluteOffset: number) {
  const textNodes = getTextNodes(root);
  if (textNodes.length === 0) return null;

  const target = Math.max(0, absoluteOffset);
  let cursor = 0;

  for (const node of textNodes) {
    const length = node.textContent?.length ?? 0;
    const next = cursor + length;
    if (target <= next) {
      return {
        node,
        offset: Math.max(0, Math.min(length, target - cursor)),
      };
    }
    cursor = next;
  }

  const lastNode = textNodes[textNodes.length - 1];
  const lastLength = lastNode.textContent?.length ?? 0;
  return { node: lastNode, offset: lastLength };
}

function clearReviewMarks(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      '[data-grade-comment-id], [data-grammar-issue-id]'
    )
    .forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (!parent) return;
      while (wrapper.firstChild)
        parent.insertBefore(wrapper.firstChild, wrapper);
      parent.removeChild(wrapper);
      parent.normalize();
    });
}

function applyReviewHighlights(
  root: HTMLElement,
  highlights: GradeHighlight[]
) {
  const textNodes = getTextNodes(root);
  const ranges: { start: number; end: number; id: string }[] = [];
  const highlightById = new Map(highlights.map((h) => [h.id, h]));

  let global = '';
  for (const node of textNodes) {
    const text = node.textContent ?? '';
    global += text;
  }

  for (const h of highlights) {
    const range = findExcerptRange(global, h.excerpt, h.occurrence ?? 1);
    if (!range) continue;
    const start = Math.max(0, Math.min(global.length, range.start));
    const end = Math.max(0, Math.min(global.length, range.end));
    if (end <= start) continue;
    ranges.push({ start, end, id: h.id });
  }

  ranges.sort((a, b) => b.start - a.start);

  for (const r of ranges) {
    const startBoundary = resolveTextBoundary(root, r.start);
    const endBoundary = resolveTextBoundary(root, r.end);
    if (!startBoundary || !endBoundary) continue;

    if (
      startBoundary.node === endBoundary.node &&
      startBoundary.offset >= endBoundary.offset
    ) {
      continue;
    }

    const source = highlightById.get(r.id);
    if (!source) continue;
    const dataAttr = source.dataAttr ?? 'data-grade-comment-id';
    const className = source.className ?? 'grade-comment-mark';

    const currentNodes = getTextNodes(root);
    const startIndex = currentNodes.indexOf(startBoundary.node);
    const endIndex = currentNodes.indexOf(endBoundary.node);
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) continue;

    for (let nodeIndex = endIndex; nodeIndex >= startIndex; nodeIndex--) {
      const node = currentNodes[nodeIndex];
      const nodeLength = node.textContent?.length ?? 0;
      const segmentStart = nodeIndex === startIndex ? startBoundary.offset : 0;
      const segmentEnd = nodeIndex === endIndex ? endBoundary.offset : nodeLength;
      if (segmentEnd <= segmentStart) continue;

      const segmentRange = document.createRange();
      try {
        segmentRange.setStart(node, segmentStart);
        segmentRange.setEnd(node, segmentEnd);
      } catch {
        continue;
      }
      if (segmentRange.collapsed) continue;

      const wrapper = document.createElement('span');
      wrapper.setAttribute(dataAttr, r.id);
      wrapper.className = className;
      try {
        segmentRange.surroundContents(wrapper);
      } catch {
        wrapper.appendChild(segmentRange.extractContents());
        segmentRange.insertNode(wrapper);
      }
    }
  }
}

type Props = {
  contentRoot: HTMLElement | null;
  highlights: GradeHighlight[];
  activeGradeCommentId: string | null;
  onGradeCommentSelect: (id: string) => void;
  onGrammarIssueHover: (id: string | null, rect: DOMRect | null) => void;
};

export function GradeHighlightsOverlay({
  contentRoot,
  highlights,
  activeGradeCommentId,
  onGradeCommentSelect,
  onGrammarIssueHover,
}: Props) {
  // Store callbacks in refs so the mousemove effect never re-runs
  // due to callback identity changes.
  const commentSelectRef = useRef(onGradeCommentSelect);
  commentSelectRef.current = onGradeCommentSelect;
  const grammarHoverRef = useRef(onGrammarIssueHover);
  grammarHoverRef.current = onGrammarIssueHover;

  // ── Effect 1: Build/rebuild DOM marks when highlights change ──────
  // This is the ONLY effect that touches the DOM structure.
  useEffect(() => {
    if (!contentRoot) return;
    clearReviewMarks(contentRoot);
    applyReviewHighlights(contentRoot, highlights);
    return () => {
      if (contentRoot) clearReviewMarks(contentRoot);
    };
  }, [contentRoot, highlights]);

  // ── Effect 2: Apply focused class based on activeGradeCommentId ───
  // Does NOT rebuild marks — only toggles a CSS class.
  useEffect(() => {
    if (!contentRoot) return;
    contentRoot
      .querySelectorAll<HTMLElement>('.grade-comment-mark')
      .forEach((el) => el.classList.remove('focused'));
    if (activeGradeCommentId) {
      contentRoot
        .querySelectorAll<HTMLElement>(
          `[data-grade-comment-id="${activeGradeCommentId}"]`
        )
        .forEach((el) => el.classList.add('focused'));
      // Scroll into view
      const first = contentRoot.querySelector<HTMLElement>(
        `[data-grade-comment-id="${activeGradeCommentId}"]`
      );
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [contentRoot, activeGradeCommentId, highlights]);

  // ── Effect 3: Click + hover listeners on the contentRoot ──────────
  // Attached ONCE to the contentRoot. Uses event delegation so it
  // works regardless of whether marks have been rebuilt. Never re-runs
  // due to callback changes (uses refs).
  useEffect(() => {
    if (!contentRoot) return;

    let hoveredCommentId: string | null = null;
    let hoveredGrammarId: string | null = null;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (id) commentSelectRef.current(id);
    };

    const onMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;

      // Comment hover
      const commentMark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      const commentId =
        commentMark?.getAttribute('data-grade-comment-id') ?? null;

      if (commentId !== hoveredCommentId) {
        if (hoveredCommentId) {
          contentRoot
            .querySelectorAll<HTMLElement>(
              `[data-grade-comment-id="${hoveredCommentId}"]`
            )
            .forEach((el) => el.classList.remove('hovered'));
        }
        if (commentId) {
          contentRoot
            .querySelectorAll<HTMLElement>(
              `[data-grade-comment-id="${commentId}"]`
            )
            .forEach((el) => el.classList.add('hovered'));
        }
        hoveredCommentId = commentId;
      }

      // Grammar hover
      const grammarMark = target?.closest(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
      const grammarId =
        grammarMark?.getAttribute('data-grammar-issue-id') ?? null;

      if (grammarId !== hoveredGrammarId) {
        if (grammarId && grammarMark) {
          grammarHoverRef.current(
            grammarId,
            grammarMark.getBoundingClientRect()
          );
        } else {
          grammarHoverRef.current(null, null);
        }
        hoveredGrammarId = grammarId;
      }
    };

    const onMouseLeave = () => {
      if (hoveredCommentId) {
        contentRoot
          .querySelectorAll<HTMLElement>(
            `[data-grade-comment-id="${hoveredCommentId}"]`
          )
          .forEach((el) => el.classList.remove('hovered'));
        hoveredCommentId = null;
      }
      if (hoveredGrammarId) {
        grammarHoverRef.current(null, null);
        hoveredGrammarId = null;
      }
    };

    contentRoot.addEventListener('click', onClick);
    contentRoot.addEventListener('mousemove', onMouseMove);
    contentRoot.addEventListener('mouseleave', onMouseLeave);

    return () => {
      contentRoot.removeEventListener('click', onClick);
      contentRoot.removeEventListener('mousemove', onMouseMove);
      contentRoot.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [contentRoot]); // Only depends on contentRoot — never re-runs for callback changes

  return null;
}
