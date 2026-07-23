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

type PasteAlertCountGroup = {
  documentId: string;
  _count: { _all: number };
};

export function summarizePasteAlertGroups(
  totalRows: PasteAlertCountGroup[],
  unreviewedRows: PasteAlertCountGroup[]
): Map<string, PasteAlertSummary> {
  const summaries = new Map<string, PasteAlertSummary>();

  for (const row of totalRows) {
    summaries.set(row.documentId, {
      count: row._count._all,
      unreviewedCount: 0,
    });
  }

  for (const row of unreviewedRows) {
    const existing = summaries.get(row.documentId) ?? {
      count: row._count._all,
      unreviewedCount: 0,
    };
    existing.unreviewedCount = row._count._all;
    summaries.set(row.documentId, existing);
  }

  return summaries;
}
