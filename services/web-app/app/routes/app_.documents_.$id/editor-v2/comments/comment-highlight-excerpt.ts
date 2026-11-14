/** Live highlighted text for a comment mark in the document body. */
export function readCommentHighlightExcerpt(
  contentRoot: HTMLElement | null,
  commentId: string
): string | null {
  if (!contentRoot) return null;
  const mark = contentRoot.querySelector<HTMLElement>(
    `.comment-mark[data-comment-id="${CSS.escape(commentId)}"]`
  );
  if (!mark) return null;
  const text = mark.textContent?.trim();
  return text || null;
}

export function initialsForDisplayName(name: string | null | undefined) {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}