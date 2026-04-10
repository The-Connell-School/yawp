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
  // Apply review highlights
  useEffect(() => {
    if (!contentRoot) return;
    clearReviewMarks(contentRoot);
    applyReviewHighlights(contentRoot, highlights);
  }, [contentRoot, highlights]);

  // Toggle .focused class on active grade comment
  useEffect(() => {
    if (!contentRoot) return;
    contentRoot.querySelectorAll<HTMLElement>('.grade-comment-mark').forEach((el) => {
      el.classList.remove('focused');
    });
    if (!activeGradeCommentId) return;
    contentRoot
      .querySelectorAll<HTMLElement>(
        `[data-grade-comment-id="${activeGradeCommentId}"]`
      )
      .forEach((el) => el.classList.add('focused'));
  }, [contentRoot, activeGradeCommentId]);

  // Scroll active grade comment into view
  useEffect(() => {
    if (!contentRoot || !activeGradeCommentId) return;
    const first = contentRoot.querySelector<HTMLElement>(
      `[data-grade-comment-id="${activeGradeCommentId}"]`
    );
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [contentRoot, activeGradeCommentId]);

  // Click handler for grade comment marks
  useEffect(() => {
    if (!contentRoot) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (!id) return;
      onGradeCommentSelect(id);
    };

    contentRoot.addEventListener('click', onClick);
    return () => contentRoot.removeEventListener('click', onClick);
  }, [contentRoot, onGradeCommentSelect]);

  // Grade hover handlers
  useEffect(() => {
    if (!contentRoot) return;

    const setGradeHover = (id: string, hovered: boolean) => {
      contentRoot
        .querySelectorAll<HTMLElement>(`[data-grade-comment-id="${id}"]`)
        .forEach((el) => {
          el.classList.toggle('hovered', hovered);
        });
    };

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (!id) return;

      const relatedTarget = event.relatedTarget as HTMLElement | null;
      const relatedMark = relatedTarget?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (relatedMark?.getAttribute('data-grade-comment-id') === id) return;

      setGradeHover(id, true);
    };

    const onMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grade-comment-id');
      if (!id) return;

      const relatedTarget = event.relatedTarget as HTMLElement | null;
      const relatedMark = relatedTarget?.closest(
        '[data-grade-comment-id]'
      ) as HTMLElement | null;
      if (relatedMark?.getAttribute('data-grade-comment-id') === id) return;

      setGradeHover(id, false);
    };

    contentRoot.addEventListener('mouseover', onMouseOver);
    contentRoot.addEventListener('mouseout', onMouseOut);
    return () => {
      contentRoot.removeEventListener('mouseover', onMouseOver);
      contentRoot.removeEventListener('mouseout', onMouseOut);
      contentRoot
        .querySelectorAll<HTMLElement>('.grade-comment-mark.hovered')
        .forEach((el) => el.classList.remove('hovered'));
    };
  }, [contentRoot]);

  // Grammar issue hover handler
  useEffect(() => {
    if (!contentRoot) return;

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute('data-grammar-issue-id');
      if (!id) return;
      onGrammarIssueHover(id, mark.getBoundingClientRect());
    };

    const onMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest(
        '[data-grammar-issue-id]'
      ) as HTMLElement | null;
      if (!mark) return;
      onGrammarIssueHover(null, null);
    };

    contentRoot.addEventListener('mouseover', onMouseOver);
    contentRoot.addEventListener('mouseout', onMouseOut);
    return () => {
      contentRoot.removeEventListener('mouseover', onMouseOver);
      contentRoot.removeEventListener('mouseout', onMouseOut);
    };
  }, [contentRoot, onGrammarIssueHover]);

  return null; // overlay is pure DOM mutation, no JSX
}
