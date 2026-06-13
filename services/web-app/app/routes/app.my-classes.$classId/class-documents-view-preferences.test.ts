import { describe, expect, test } from 'bun:test';

import {
  CLASS_DOCUMENTS_VIEW_STORAGE_KEY,
  getStoredCollapsedDocumentGroups,
  mergeClassDocumentsViewPreferences,
  mergeStoredClassDocumentsSearchParams,
  parseClassDocumentsViewPreferences,
  preferencesFromSearchParams,
  serializeClassDocumentsViewPreferences,
  withStoredCollapsedDocumentGroups,
} from './class-documents-view-preferences';

describe('class documents view preferences', () => {
  test('uses one shared storage key across all classes', () => {
    expect(CLASS_DOCUMENTS_VIEW_STORAGE_KEY).toBe('yawp.class-documents-view');
  });

  test('round-trips supported filter and grouping values', () => {
    const serialized = serializeClassDocumentsViewPreferences({
      studentIds: ['student-1', 'student-2'],
      assignmentIds: ['assignment-1'],
      status: 'needs-grading',
      documentGroup: 'status',
      collapsedGroups: {
        status: ['needs-grading', 'released'],
      },
    });

    expect(parseClassDocumentsViewPreferences(serialized)).toEqual({
      studentIds: ['student-1', 'student-2'],
      assignmentIds: ['assignment-1'],
      status: 'needs-grading',
      documentGroup: 'status',
      collapsedGroups: {
        status: ['needs-grading', 'released'],
      },
    });
  });

  test('ignores invalid stored values', () => {
    expect(
      parseClassDocumentsViewPreferences(
        JSON.stringify({
          status: 'bogus',
          documentGroup: 'bogus',
        })
      )
    ).toEqual({});
  });

  test('extracts preferences from search params', () => {
    const params = new URLSearchParams(
      'tab=documents&studentId=student-1,student-2&assignmentId=assignment-1&status=graded&documentGroup=assignment'
    );

    expect(preferencesFromSearchParams(params)).toEqual({
      studentIds: ['student-1', 'student-2'],
      assignmentIds: ['assignment-1'],
      status: 'graded',
      documentGroup: 'assignment',
    });
  });

  test('merges stored preferences into missing search params', () => {
    const merged = mergeStoredClassDocumentsSearchParams({
      searchParams: new URLSearchParams('tab=documents'),
      storedPreferences: {
        studentIds: ['student-1'],
        status: 'needs-grading',
        documentGroup: 'status',
      },
    });

    expect(merged.shouldReplace).toBe(true);
    expect(merged.searchParams.get('tab')).toBe('documents');
    expect(merged.searchParams.get('studentId')).toBe('student-1');
    expect(merged.searchParams.get('status')).toBe('needs-grading');
    expect(merged.searchParams.get('documentGroup')).toBe('status');
  });

  test('does not override explicit URL params with stored preferences', () => {
    const merged = mergeStoredClassDocumentsSearchParams({
      searchParams: new URLSearchParams('tab=documents&status=released'),
      storedPreferences: {
        status: 'needs-grading',
        documentGroup: 'student',
      },
    });

    expect(merged.shouldReplace).toBe(true);
    expect(merged.searchParams.get('status')).toBe('released');
    expect(merged.searchParams.get('documentGroup')).toBe('student');
  });

  test('stores collapsed groups per grouping mode', () => {
    const stored = withStoredCollapsedDocumentGroups(
      {
        documentGroup: 'status',
        collapsedGroups: {
          student: ['student-1'],
        },
      },
      'status',
      ['needs-grading']
    );

    expect(getStoredCollapsedDocumentGroups(stored, 'status')).toEqual(
      new Set(['needs-grading'])
    );
    expect(getStoredCollapsedDocumentGroups(stored, 'student')).toEqual(
      new Set(['student-1'])
    );
  });

  test('clears stored filters removed from the URL', () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      storage.set(
        CLASS_DOCUMENTS_VIEW_STORAGE_KEY,
        JSON.stringify({
          studentIds: ['student-1'],
          assignmentIds: ['assignment-1'],
          status: 'needs-grading',
          documentGroup: 'student',
        })
      );

      mergeClassDocumentsViewPreferences(
        new URLSearchParams('tab=documents&status=graded')
      );

      expect(
        parseClassDocumentsViewPreferences(
          storage.get(CLASS_DOCUMENTS_VIEW_STORAGE_KEY)
        )
      ).toEqual({
        status: 'graded',
      });
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  test('mergeClassDocumentsViewPreferences preserves collapsed groups', () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      mergeClassDocumentsViewPreferences(
        new URLSearchParams('tab=documents&documentGroup=status'),
        {
          collapsedGroups: {
            status: ['graded'],
          },
        }
      );

      mergeClassDocumentsViewPreferences(
        new URLSearchParams(
          'tab=documents&documentGroup=status&status=needs-grading'
        )
      );

      expect(
        parseClassDocumentsViewPreferences(
          storage.get(CLASS_DOCUMENTS_VIEW_STORAGE_KEY)
        )
      ).toEqual({
        documentGroup: 'status',
        status: 'needs-grading',
        collapsedGroups: {
          status: ['graded'],
        },
      });
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
