import { describe, expect, test } from 'bun:test';

import type { TeacherDocumentWorkRow } from '~/utils/teacher-document-work-utils';

import {
  DEFAULT_DOCUMENT_WORK_SORT,
  parseDocumentWorkSort,
  sortTeacherDocumentWorkRows,
  toggleDocumentWorkSort,
} from './teacher-document-work-sort';

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function row(
  overrides: Partial<TeacherDocumentWorkRow> & Pick<TeacherDocumentWorkRow, 'id'>
): TeacherDocumentWorkRow {
  return {
    title: null,
    updatedAt: new Date('2026-06-01T12:00:00.000Z'),
    membership: {
      id: 'profile-1',
      user: { name: 'Alex Student', email: 'alex@example.com' },
    },
    assignment: { id: 'assignment-1', title: 'Essay One' },
    resolvedClass: {
      id: 'class-1',
      grade: '9th',
      period: '1st',
      title: null,
    },
    submissions: [],
    latestSubmission: null,
    submissionCount: 0,
    ...overrides,
  };
}

describe('parseDocumentWorkSort', () => {
  test('parses valid sort preferences', () => {
    expect(parseDocumentWorkSort({ field: 'student', direction: 'asc' })).toEqual(
      { field: 'student', direction: 'asc' }
    );
  });

  test('rejects invalid sort preferences', () => {
    expect(parseDocumentWorkSort({ field: 'title', direction: 'asc' })).toBeUndefined();
    expect(parseDocumentWorkSort({ field: 'student', direction: 'up' })).toBeUndefined();
  });
});

describe('toggleDocumentWorkSort', () => {
  test('flips direction when clicking the active column', () => {
    expect(
      toggleDocumentWorkSort(
        { field: 'student', direction: 'asc' },
        'student'
      )
    ).toEqual({ field: 'student', direction: 'desc' });
  });

  test('uses a sensible default direction for new columns', () => {
    expect(
      toggleDocumentWorkSort(DEFAULT_DOCUMENT_WORK_SORT, 'student')
    ).toEqual({ field: 'student', direction: 'asc' });
    expect(
      toggleDocumentWorkSort(DEFAULT_DOCUMENT_WORK_SORT, 'submittedAt')
    ).toEqual({ field: 'submittedAt', direction: 'desc' });
  });
});

describe('sortTeacherDocumentWorkRows', () => {
  test('sorts flat rows by student name', () => {
    const sorted = sortTeacherDocumentWorkRows({
      documents: [
        row({
          id: 'doc-z',
          membership: {
            id: 'profile-z',
            user: { name: 'Zoe Carter', email: 'zoe@example.com' },
          },
        }),
        row({
          id: 'doc-a',
          membership: {
            id: 'profile-a',
            user: { name: 'Ángela Ruiz', email: 'angela@example.com' },
          },
        }),
      ],
      sort: { field: 'student', direction: 'asc' },
      collator,
    });

    expect(sorted.map((document) => document.id)).toEqual(['doc-a', 'doc-z']);
  });

  test('sorts rows by last edited descending by default', () => {
    const sorted = sortTeacherDocumentWorkRows({
      documents: [
        row({
          id: 'older',
          updatedAt: new Date('2026-06-01T12:00:00.000Z'),
        }),
        row({
          id: 'newer',
          updatedAt: new Date('2026-06-03T12:00:00.000Z'),
        }),
      ],
      collator,
    });

    expect(sorted.map((document) => document.id)).toEqual(['newer', 'older']);
  });

  test('preserves grouped document order when passed pre-sorted rows', () => {
    const sorted = sortTeacherDocumentWorkRows({
      documents: [
        row({
          id: 'doc-b',
          membership: {
            id: 'profile-b',
            user: { name: 'Brian Adams', email: 'brian@example.com' },
          },
        }),
        row({
          id: 'doc-a',
          membership: {
            id: 'profile-a',
            user: { name: 'Ángela Ruiz', email: 'angela@example.com' },
          },
        }),
      ],
      sort: { field: 'student', direction: 'asc' },
      collator,
    });

    expect(sorted.map((document) => document.id)).toEqual(['doc-a', 'doc-b']);
  });
});
