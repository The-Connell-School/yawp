const BLOCK_TAG_PATTERN =
  /^(p|h[1-6]|blockquote|li|div|pre|ul|ol|figure|table)$/i;

/**
 * Clipboard and legacy exports from Word, Google Docs, and similar tools
 * often include bare `<br>` elements between block tags. ProseMirror's
 * `parseFromClipboard` sibling normalizer wraps those breaks in a way that
 * can throw `RangeError: Can not convert <hardBreak> to a Fragment` and abort
 * the whole paste.
 *
 * Rewrite inter-block breaks into empty paragraphs so the blank line is kept
 * without leaving orphan hardBreak siblings at the slice top level.
 */
export function normalizeInterBlockBreaks(html: string): string {
  if (!html) return html;

  let normalized = html.replace(
    /(<\/(?:p|h[1-6]|blockquote|li|div|pre|figure|table)\b[^>]*>)(\s*(?:<br\s*\/?>\s*)+)(<(?:p|h[1-6]|blockquote|li|div|pre|figure|table)\b[^>]*>)/gi,
    (_match, blockClose, breakRun, blockOpen) => {
      const breakCount = (breakRun.match(/<br\b/gi) ?? []).length;
      const spacer = Array.from({ length: breakCount }, () => '<p><br></p>').join(
        ''
      );
      return `${blockClose}${spacer}${blockOpen}`;
    }
  );

  normalized = normalized.replace(
    /^(?:\s*<br\s*\/?>\s*)+/i,
    (leading) => {
      const breakCount = (leading.match(/<br\b/gi) ?? []).length;
      return Array.from({ length: breakCount }, () => '<p><br></p>').join('');
    }
  );

  normalized = normalized.replace(
    /(?:\s*<br\s*\/?>\s*)+$/i,
    (trailing) => {
      const breakCount = (trailing.match(/<br\b/gi) ?? []).length;
      return Array.from({ length: breakCount }, () => '<p><br></p>').join('');
    }
  );

  return normalized;
}

/**
 * Normalizes HTML before TipTap parses it on mount or when rehydrating from
 * IndexedDB. Block-level-only content is wrapped in a paragraph when needed.
 */
export function normalizeDocumentEditorHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;

  let normalized = normalizeInterBlockBreaks(html.trim());

  const probe = document.createElement('div');
  probe.innerHTML = normalized;

  const onlyBreaks =
    probe.childNodes.length > 0 &&
    [...probe.childNodes].every(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName === 'BR'
    );

  if (onlyBreaks) {
    normalized = [...probe.childNodes]
      .map(() => '<p><br></p>')
      .join('');
  } else if (
    probe.childNodes.length === 1 &&
    probe.firstChild?.nodeType === Node.ELEMENT_NODE
  ) {
    const tag = (probe.firstChild as Element).tagName;
    if (!BLOCK_TAG_PATTERN.test(tag)) {
      normalized = `<p>${normalized}</p>`;
    }
  }

  return normalized;
}