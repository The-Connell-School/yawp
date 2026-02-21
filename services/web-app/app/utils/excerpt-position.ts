type NormalizedText = {
  normalized: string;
  indexMap: number[];
};

function normalizeWhitespace(source: string): NormalizedText {
  let normalized = '';
  const indexMap: number[] = [];
  let lastWasSpace = true;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const isSpace = /\s/.test(ch);

    if (isSpace) {
      if (!lastWasSpace) {
        normalized += ' ';
        indexMap.push(i);
      }
      lastWasSpace = true;
      continue;
    }

    normalized += ch;
    indexMap.push(i);
    lastWasSpace = false;
  }

  const start = normalized[0] === ' ' ? 1 : 0;
  const end = normalized.endsWith(' ') ? normalized.length - 1 : normalized.length;

  return {
    normalized: normalized.slice(start, end),
    indexMap: indexMap.slice(start, end),
  };
}

export type ExcerptRange = {
  start: number;
  end: number;
};

export function findAllExcerptRanges(
  source: string,
  excerpt: string | null | undefined
): ExcerptRange[] {
  const trimmedExcerpt = (excerpt ?? '').trim();
  if (!source || !trimmedExcerpt) return [];

  const normalizedSource = normalizeWhitespace(source);
  const normalizedExcerpt = normalizeWhitespace(trimmedExcerpt).normalized;
  if (!normalizedSource.normalized || !normalizedExcerpt) return [];

  const ranges: ExcerptRange[] = [];
  let from = 0;

  while (true) {
    const idx = normalizedSource.normalized.indexOf(normalizedExcerpt, from);
    if (idx === -1) break;

    const start = normalizedSource.indexMap[idx];
    const endNormalizedIndex = idx + normalizedExcerpt.length - 1;
    const end = (normalizedSource.indexMap[endNormalizedIndex] ?? start) + 1;
    ranges.push({ start, end });

    from = idx + normalizedExcerpt.length;
  }

  return ranges;
}

export function findExcerptRange(
  source: string,
  excerpt: string | null | undefined,
  occurrence = 1
): ExcerptRange | null {
  if (!Number.isFinite(occurrence) || occurrence < 1) return null;
  const ranges = findAllExcerptRanges(source, excerpt);
  return ranges[occurrence - 1] ?? null;
}

export function findExcerptOccurrenceAtOffset(args: {
  source: string;
  excerpt: string | null | undefined;
  selectionStart: number;
}): number {
  const ranges = findAllExcerptRanges(args.source, args.excerpt);
  if (ranges.length === 0) return 1;

  const matchIdx = ranges.findIndex(
    (range) =>
      args.selectionStart >= range.start && args.selectionStart <= range.end
  );

  return matchIdx === -1 ? 1 : matchIdx + 1;
}
