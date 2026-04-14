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

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'OL', 'UL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE',
]);

function getClosestBlockParent(node: Node): Element | null {
  let el = node.parentElement;
  while (el) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
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

  // Build block-aware global text with segment tracking
  const segments: { node: Text; globalStart: number; length: number }[] = [];
  let global = '';
  let lastBlockParent: Element | null = null;

  for (const node of textNodes) {
    const blockParent = getClosestBlockParent(node);
    if (global.length > 0 && blockParent && blockParent !== lastBlockParent) {
      global += '\n';
    }
    const text = node.textContent ?? '';
    segments.push({ node, globalStart: global.length, length: text.length });
    global += text;
    if (blockParent) lastBlockParent = blockParent;
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
    // Re-walk current text nodes each iteration (prior wraps may have split nodes)
    const currentNodes = getTextNodes(root);

    // Block-aware boundary resolution on CURRENT DOM state
    const resolveInCurrent = (offset: number): { node: Text; offset: number } | null => {
      if (currentNodes.length === 0) return null;
      const target = Math.max(0, offset);
      let cursor = 0;
      let lastBlock: Element | null = null;

      for (const node of currentNodes) {
        const block = getClosestBlockParent(node);
        if (cursor > 0 && block && block !== lastBlock) cursor += 1;
        const len = node.textContent?.length ?? 0;
        if (target <= cursor + len) {
          return { node, offset: Math.min(len, target - cursor) };
        }
        cursor += len;
        if (block) lastBlock = block;
      }

      const last = currentNodes[currentNodes.length - 1];
      return { node: last, offset: last.textContent?.length ?? 0 };
    };

    const startBoundary = resolveInCurrent(r.start);
    const endBoundary = resolveInCurrent(r.end);
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
  onGrammarIssueHover: (ids: string[], rect: DOMRect | null) => void;
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
    let hoveredGrammarKey = '';

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

      // Grammar hover — collect ALL grammar issue IDs at this DOM position
      const grammarIds: string[] = [];
      let el: HTMLElement | null = target;
      while (el && el !== contentRoot) {
        const gid = el.getAttribute('data-grammar-issue-id');
        if (gid && !grammarIds.includes(gid)) grammarIds.push(gid);
        el = el.parentElement;
      }

      const newGrammarKey = grammarIds.join(',');
      if (newGrammarKey !== hoveredGrammarKey) {
        if (grammarIds.length > 0) {
          const innerMark = target?.closest(
            '[data-grammar-issue-id]'
          ) as HTMLElement | null;
          grammarHoverRef.current(
            grammarIds,
            innerMark?.getBoundingClientRect() ?? null
          );
        } else {
          grammarHoverRef.current([], null);
        }
        hoveredGrammarKey = newGrammarKey;
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
      if (hoveredGrammarKey) {
        grammarHoverRef.current([], null);
        hoveredGrammarKey = '';
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
