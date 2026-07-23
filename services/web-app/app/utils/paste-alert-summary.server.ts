export type WritingSignalFilter = 'all' | 'any' | 'unreviewed';

const WRITING_SIGNAL_FILTERS: WritingSignalFilter[] = [
  'all',
  'any',
  'unreviewed',
];

export function parseWritingSignalFilter(
  value: string | null | undefined
): WritingSignalFilter {
  return WRITING_SIGNAL_FILTERS.includes(value as WritingSignalFilter)
    ? (value as WritingSignalFilter)
    : 'all';
}

/** Relation filter to apply to a Document `where` before any `take` limit,
 * so a paste-activity URL filter can't be silently truncated by row limits. */
export function buildPasteAlertRelationWhere(signal: WritingSignalFilter) {
  if (signal === 'any') {
    return { pasteAlerts: { some: {} } };
  }

  if (signal === 'unreviewed') {
    return { pasteAlerts: { some: { reviewedAt: null } } };
  }

  return null;
}

export type PasteAlertSummary = {
  count: number;
  unreviewedCount: number;
};

export function summarizePasteAlertsByDocument(
  rows: Array<{ documentId: string; reviewedAt?: Date | null }>
): Map<string, PasteAlertSummary> {
  const summaries = new Map<string, PasteAlertSummary>();

  for (const row of rows) {
    const existing = summaries.get(row.documentId) ?? {
      count: 0,
      unreviewedCount: 0,
    };
    existing.count += 1;
    if (!row.reviewedAt) {
      existing.unreviewedCount += 1;
    }
    summaries.set(row.documentId, existing);
  }

  return summaries;
}
