import { describe, expect, test } from 'bun:test';
import { resolvePasteAlertSheetView } from './paste-alert-sheet';

const alert = {
  id: 'alert-1',
  createdAt: '2026-07-23T12:00:00Z',
  textLength: 250,
  content: 'Student A paste content',
  reviewedAt: null,
  reviewedByMembership: null,
};

describe('paste alert sheet target binding', () => {
  test('shows data only when the response belongs to the active document', () => {
    const matching = resolvePasteAlertSheetView(
      'doc-a',
      {
        document: {
          id: 'doc-a',
          title: 'Essay A',
          membership: {
            user: { name: 'Student A', email: 'a@example.test' },
          },
        },
        alerts: [alert],
        hasMore: false,
      },
      'idle'
    );

    expect(matching.alerts).toEqual([alert]);
    expect(matching.isLoading).toBe(false);
  });

  test('withholds a delayed old response after switching documents', () => {
    const switched = resolvePasteAlertSheetView(
      'doc-b',
      {
        document: {
          id: 'doc-a',
          title: 'Essay A',
          membership: {
            user: { name: 'Student A', email: 'a@example.test' },
          },
        },
        alerts: [alert],
        hasMore: false,
      },
      'loading'
    );

    expect(switched.alerts).toEqual([]);
    expect(switched.isLoading).toBe(true);
    expect(switched.hasError).toBe(false);
  });

  test('shows an explicit error instead of retained data after a failed load', () => {
    const failed = resolvePasteAlertSheetView(
      'doc-b',
      { error: 'Not found' },
      'idle'
    );

    expect(failed.alerts).toEqual([]);
    expect(failed.isLoading).toBe(false);
    expect(failed.hasError).toBe(true);
  });
});
