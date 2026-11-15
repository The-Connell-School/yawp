/** Unique comment ids for margin layout (draft id shares persisted comment id). */
export function uniqueMarginCommentIds(
  commentIds: string[],
  pendingDraftId?: string | null
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  if (pendingDraftId) push(pendingDraftId);
  for (const id of commentIds) push(id);

  return ordered;
}