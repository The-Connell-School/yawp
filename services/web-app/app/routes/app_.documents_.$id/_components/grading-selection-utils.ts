function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
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
  if (!excerpt || excerpt.length > 120) return null;

  const textNodes = getTextNodes(root);
  const nodeSpans: { node: Text; start: number; end: number }[] = [];
  let pos = 0;
  let global = '';
  for (const node of textNodes) {
    const t = node.textContent ?? '';
    nodeSpans.push({ node, start: pos, end: pos + t.length });
    global += t;
    pos += t.length;
  }

  const startNode = range.startContainer;
  if (!isTextNode(startNode)) return null;
  const span = nodeSpans.find((s) => s.node === startNode);
  if (!span) return null;
  const startOffset = span.start + range.startOffset;

  let occurrence = 0;
  let from = 0;
  while (true) {
    const idx = global.indexOf(excerpt, from);
    if (idx === -1) break;
    occurrence += 1;
    if (startOffset >= idx && startOffset <= idx + excerpt.length) {
      return { excerpt, occurrence };
    }
    from = idx + excerpt.length;
  }

  return { excerpt, occurrence: 1 };
}
