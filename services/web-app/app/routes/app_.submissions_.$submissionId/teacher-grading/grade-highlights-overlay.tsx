import { useEffect } from 'react';
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
        // Fallback when the browser rejects surroundContents due to stale boundaries.
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
  useEffect(() => {
    if (!contentRoot) return;

    // 1. Clear and rebuild marks
    clearReviewMarks(contentRoot);
    applyReviewHighlights(contentRoot, highlights);

    // 2. Apply focused class
    contentRoot.querySelectorAll<HTMLElement>('.grade-comment-mark').forEach(el => {
      el.classList.remove('focused');
    });
    if (activeGradeCommentId) {
      contentRoot.querySelectorAll<HTMLElement>(
        `[data-grade-comment-id="${activeGradeCommentId}"]`
      ).forEach(el => el.classList.add('focused'));
    }

    // 3. Scroll active into view
    if (activeGradeCommentId) {
      const first = contentRoot.querySelector<HTMLElement>(
        `[data-grade-comment-id="${activeGradeCommentId}"]`
      );
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 4. Click handler for grade comments
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest('[data-grade-comment-id]') as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (id) onGradeCommentSelect(id);
    };
    contentRoot.addEventListener('click', onClick);

    // 5+6. Single mousemove listener for all hover states.
    // This avoids per-element listeners that go stale when marks are rebuilt.
    // 5+6. Hover tracking via mousemove with elementFromPoint.
    // Uses elementFromPoint instead of event.target to reliably find
    // the mark element even when hovering over child text nodes.
    // A small clear-delay prevents flicker on text node boundaries.
    let currentHoveredCommentId: string | null = null;
    let currentHoveredGrammarId: string | null = null;
    let grammarClearTimer: ReturnType<typeof setTimeout> | null = null;

    const findMark = (x: number, y: number, attr: string): HTMLElement | null => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest(`[${attr}]`) as HTMLElement | null;
    };

    const onMouseMove = (event: MouseEvent) => {
      // --- Grade comment hover ---
      const commentMark = findMark(event.clientX, event.clientY, 'data-grade-comment-id');
      const commentId = commentMark?.getAttribute('data-grade-comment-id') ?? null;

      if (commentId !== currentHoveredCommentId) {
        if (currentHoveredCommentId) {
          contentRoot.querySelectorAll<HTMLElement>(`[data-grade-comment-id="${currentHoveredCommentId}"]`)
            .forEach(el => el.classList.remove('hovered'));
        }
        if (commentId) {
          contentRoot.querySelectorAll<HTMLElement>(`[data-grade-comment-id="${commentId}"]`)
            .forEach(el => el.classList.add('hovered'));
        }
        currentHoveredCommentId = commentId;
      }

      // --- Grammar issue hover ---
      const grammarMark = findMark(event.clientX, event.clientY, 'data-grammar-issue-id');
      const grammarId = grammarMark?.getAttribute('data-grammar-issue-id') ?? null;

      if (grammarId !== currentHoveredGrammarId) {
        // Cancel any pending clear
        if (grammarClearTimer) { clearTimeout(grammarClearTimer); grammarClearTimer = null; }

        if (grammarId && grammarMark) {
          onGrammarIssueHover(grammarId, grammarMark.getBoundingClientRect());
          currentHoveredGrammarId = grammarId;
        } else {
          // Small delay before clearing — avoids flicker when crossing
          // text node boundaries within the same mark
          grammarClearTimer = setTimeout(() => {
            onGrammarIssueHover(null, null);
            currentHoveredGrammarId = null;
            grammarClearTimer = null;
          }, 50);
        }
      }
    };

    const onMouseLeave = () => {
      if (currentHoveredCommentId) {
        contentRoot.querySelectorAll<HTMLElement>(`[data-grade-comment-id="${currentHoveredCommentId}"]`)
          .forEach(el => el.classList.remove('hovered'));
        currentHoveredCommentId = null;
      }
      if (grammarClearTimer) { clearTimeout(grammarClearTimer); grammarClearTimer = null; }
      onGrammarIssueHover(null, null);
      currentHoveredGrammarId = null;
    };

    contentRoot.addEventListener('mousemove', onMouseMove);
    contentRoot.addEventListener('mouseleave', onMouseLeave);

    return () => {
      contentRoot.removeEventListener('click', onClick);
      contentRoot.removeEventListener('mousemove', onMouseMove);
      contentRoot.removeEventListener('mouseleave', onMouseLeave);
      if (grammarClearTimer) clearTimeout(grammarClearTimer);
      contentRoot.querySelectorAll<HTMLElement>('.grade-comment-mark.hovered')
        .forEach(el => el.classList.remove('hovered'));
      onGrammarIssueHover(null, null);
    };
  }, [contentRoot, highlights, activeGradeCommentId, onGradeCommentSelect, onGrammarIssueHover]);

  return null; // overlay is pure DOM mutation, no JSX
}
