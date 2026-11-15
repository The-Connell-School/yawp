function resolveCommentContentRoot(contentRoot: HTMLElement | null) {
  return (
    contentRoot ??
    document.querySelector<HTMLElement>(
      '[data-testid="document-editor-scroll"] .ProseMirror'
    )
  );
}

/** Live highlighted text for a comment mark in the document body. */
export function readCommentHighlightExcerpt(
  contentRoot: HTMLElement | null,
  commentId: string
): string | null {
  const root = resolveCommentContentRoot(contentRoot);
  if (!root) return null;
  const mark = root.querySelector<HTMLElement>(
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