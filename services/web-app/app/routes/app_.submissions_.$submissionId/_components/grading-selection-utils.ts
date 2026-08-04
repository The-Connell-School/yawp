import { findExcerptOccurrenceAtOffset } from '~/utils/excerpt-position';

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'OL',
  'UL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
]);

function getClosestBlockParent(node: Node): Element | null {
  let el = node.parentElement;
  while (el) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

function getTextNodes(root: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (isTextNode(current)) nodes.push(current);
  }
  return nodes;
}

export function getSelectionInfo(
  root: HTMLElement
): { excerpt: string; occurrence: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const excerpt = selection.toString().trim();
  if (!excerpt) return null;

  const textNodes = getTextNodes(root);
  const nodeSpans: { node: Text; start: number; end: number }[] = [];
  let pos = 0;
  let global = '';
  let lastBlockParent: Element | null = null;
  for (const node of textNodes) {
    const blockParent = getClosestBlockParent(node);
    if (global.length > 0 && blockParent && blockParent !== lastBlockParent) {
      global += '\n';
      pos += 1;
    }
    const t = node.textContent ?? '';
    nodeSpans.push({ node, start: pos, end: pos + t.length });
    global += t;
    pos += t.length;
    if (blockParent) lastBlockParent = blockParent;
  }

  const startNode = range.startContainer;
  if (!isTextNode(startNode)) return null;
  const span = nodeSpans.find((s) => s.node === startNode);
  if (!span) return null;
  const startOffset = span.start + range.startOffset;

  const occurrence = findExcerptOccurrenceAtOffset({
    source: global,
    excerpt,
    selectionStart: startOffset,
  });
  return { excerpt, occurrence };
}
