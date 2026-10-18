/** Trim snippets so the summary panel stays scannable. */
export const SNIPPET_MAX_CHARS = 240;

/**
 * A short plain-text excerpt of a graded submission: tags stripped,
 * whitespace collapsed, cut at a word boundary with an ellipsis.
 */
export function toSubmissionSnippet(
  raw: string,
  maxChars: number = SNIPPET_MAX_CHARS
): string {
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 60 ? lastSpace : maxChars).trim()}…`;
}
