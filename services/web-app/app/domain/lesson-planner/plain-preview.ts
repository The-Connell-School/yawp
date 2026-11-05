/**
 * Markdown as clean preview text (Kevin, Oct 25, note 7): a heading, bold, a
 * list, a link or a table row reads as its words, never as `###` or `**`.
 * For every place a piece is shown short: step excerpts, suggestion lines,
 * the chat's "On the stack" line and titles.
 */

export function plainPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')
    .split('\n')
    .map((line) => {
      // A table: its divider goes, each row reads "cell · cell".
      if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) return '';
      if (!line.includes('|')) return line;
      return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim()).filter(Boolean).join(' · ');
    })
    .join('\n')
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/[*`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A one-line preview, cut at a word. */
export function previewLine(markdown: string, max = 240): string {
  const text = plainPreview(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).trim()}…`;
}
