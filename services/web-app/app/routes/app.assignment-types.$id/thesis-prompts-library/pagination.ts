export const PROMPTS_PER_PAGE = 12;

export function paginatePrompts<T>(
  items: readonly T[],
  requested: string | null
) {
  const pageCount = Math.max(1, Math.ceil(items.length / PROMPTS_PER_PAGE));
  const parsed = Number(requested);
  const page =
    Number.isSafeInteger(parsed) && parsed > 0
      ? Math.min(parsed, pageCount)
      : 1;
  const offset = (page - 1) * PROMPTS_PER_PAGE;
  return {
    page,
    pageCount,
    items: items.slice(offset, offset + PROMPTS_PER_PAGE),
    start: items.length ? offset + 1 : 0,
    end: Math.min(offset + PROMPTS_PER_PAGE, items.length),
  };
}

export function paginationItems(
  page: number,
  pageCount: number
): Array<number | 'ellipsis'> {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 2) pages.add(3);
  if (page >= pageCount - 1) pages.add(pageCount - 2);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  for (const [index, value] of sorted.entries()) {
    if (index && value - sorted[index - 1] === 2) result.push(value - 1);
    else if (index && value - sorted[index - 1] > 2) result.push('ellipsis');
    result.push(value);
  }
  return result;
}
