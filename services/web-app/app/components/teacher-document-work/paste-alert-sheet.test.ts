import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isUnhandledReviewSuccess,
  mergePasteAlertSheetPage,
  PasteAlertCapturedContent,
  resolveReviewedDocumentReload,
  resolvePasteAlertSheetView,
} from './paste-alert-sheet';

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
        pageCursor: null,
        nextCursor: null,
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
        pageCursor: null,
        nextCursor: null,
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

  test('consumes a completed review response only once', () => {
    const response = { success: true };

    expect(isUnhandledReviewSuccess(response, undefined)).toBe(true);
    expect(isUnhandledReviewSuccess(response, response)).toBe(false);
    expect(isUnhandledReviewSuccess({ success: false }, undefined)).toBe(false);
  });

  test('reloads only the document whose review request completed', () => {
    expect(resolveReviewedDocumentReload('doc-a', 'doc-a')).toBe('doc-a');
    expect(resolveReviewedDocumentReload('doc-a', 'doc-b')).toBeNull();
    expect(resolveReviewedDocumentReload('doc-a', undefined)).toBeNull();
  });

  test('appends a bounded older page without duplicating alerts', () => {
    const firstPage = {
      document: {
        id: 'doc-a',
        title: 'Essay A',
        membership: {
          user: { name: 'Student A', email: 'a@example.test' },
        },
      },
      alerts: [alert],
      pageCursor: null,
      nextCursor: 'alert-1',
      hasMore: true,
    };
    const olderAlert = { ...alert, id: 'alert-2', content: null };

    const merged = mergePasteAlertSheetPage(firstPage, {
      ...firstPage,
      alerts: [alert, olderAlert],
      pageCursor: 'alert-1',
      nextCursor: null,
      hasMore: false,
    });

    expect(merged.alerts.map(({ id }) => id)).toEqual(['alert-1', 'alert-2']);
    expect(merged.hasMore).toBe(false);
  });

  test('renders a clear fallback for legacy alerts without captured text', () => {
    const markup = renderToStaticMarkup(
      createElement(PasteAlertCapturedContent, {
        content: null,
        contentTruncated: false,
      })
    );

    expect(markup).toContain('Pasted text unavailable');
  });
});
