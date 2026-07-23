import { describe, expect, test } from 'bun:test';
import {
  buildPasteAlertRelationWhere,
  parseWritingSignalFilter,
  summarizePasteAlertGroups,
} from './paste-alert-summary';

describe('paste alert summaries', () => {
  test('parses only supported writing-signal filters', () => {
    expect(parseWritingSignalFilter('any')).toBe('any');
    expect(parseWritingSignalFilter('unreviewed')).toBe('unreviewed');
    expect(parseWritingSignalFilter('unexpected')).toBe('all');
    expect(parseWritingSignalFilter(null)).toBe('all');
  });

  test('builds relation filters that can be applied before document limits', () => {
    expect(buildPasteAlertRelationWhere('all')).toBeNull();
    expect(buildPasteAlertRelationWhere('any')).toEqual({
      pasteAlerts: { some: {} },
    });
    expect(buildPasteAlertRelationWhere('unreviewed')).toEqual({
      pasteAlerts: { some: { reviewedAt: null } },
    });
  });

  test('merges database-level total and unreviewed aggregates', () => {
    const summaries = summarizePasteAlertGroups(
      [
        { documentId: 'doc-1', _count: { _all: 3 } },
        { documentId: 'doc-2', _count: { _all: 1 } },
      ],
      [{ documentId: 'doc-1', _count: { _all: 2 } }]
    );

    expect(summaries.get('doc-1')).toEqual({
      count: 3,
      unreviewedCount: 2,
    });
    expect(summaries.get('doc-2')).toEqual({
      count: 1,
      unreviewedCount: 0,
    });
  });
});
