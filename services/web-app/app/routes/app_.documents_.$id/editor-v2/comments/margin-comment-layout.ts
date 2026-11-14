/** Nudge stacked margin comment cards so they do not overlap. */
export function stackMarginCommentTops(
  orderedIds: string[],
  anchorTops: Record<string, number>,
  cardHeights: Record<string, number>,
  minGap = 8
): Record<string, number> {
  const stacked: Record<string, number> = {};
  let cursor = Number.NEGATIVE_INFINITY;

  for (const id of orderedIds) {
    const anchor = anchorTops[id];
    if (anchor === undefined) continue;
    const height = cardHeights[id] ?? 0;
    const top = Math.max(
      anchor,
      cursor === Number.NEGATIVE_INFINITY ? anchor : cursor + minGap
    );
    stacked[id] = top;
    cursor = top + height;
  }

  return stacked;
}