import { describe, expect, test } from 'bun:test';

import {
  buildClassDocumentGroups,
  type ClassDocumentGroupRow,
} from './class-documents-grouping';

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function row(
  overrides: Partial<ClassDocumentGroupRow> & Pick<ClassDocumentGroupRow, 'id'>
): ClassDocumentGroupRow {
  return {
    title: null,
    updatedAt: new Date('2026-06-01T12:00:00.000Z'),
    membership: {
      id: 'membership-1',
      user: { name: 'Alex Student', email: 'alex@example.com' },
    },
    assignment: { id: 'assignment-1', title: 'Essay One' },
    resolvedClass: null,
    submissions: [],
    latestSubmission: null,
    submissionCount: 0,
    ...overrides,
  };
}

describe('buildClassDocumentGroups', () => {
  test('groups documents by lifecycle status in workflow order', () => {
    const groups = buildClassDocumentGroups({
      documents: [
        row({
          id: 'doc-released',
          latestSubmission: { id: 'sub-1', releasedAt: new Date(), gradedAt: new Date() },
        }),
        row({
          id: 'doc-in-progress',
          latestSubmission: null,
        }),
        row({
          id: 'doc-needs-grading',
          latestSubmission: { id: 'sub-2', submittedAt: new Date() },
        }),
        row({
          id: 'doc-graded',
          latestSubmission: { id: 'sub-3', gradedAt: new Date(), score: 'A' },
        }),
      ],
      mode: 'status',
      collator,
    });

    expect(groups.map((group) => group.key)).toEqual([
      'in-progress',
      'needs-grading',
      'graded',
      'released',
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      'In Progress',
      'Needs Grading',
      'Needs Releasing',
      'Released',
    ]);
  });

  test('keeps student groups alphabetized', () => {
    const groups = buildClassDocumentGroups({
      documents: [
        row({
          id: 'doc-z',
          membership: {
            id: 'membership-z',
            user: { name: 'Zed', email: 'zed@example.com' },
          },
        }),
        row({
          id: 'doc-a',
          membership: {
            id: 'membership-a',
            user: { name: 'Ana', email: 'ana@example.com' },
          },
        }),
      ],
      mode: 'student',
      collator,
    });

    expect(groups.map((group) => group.label)).toEqual(['Ana', 'Zed']);
  });
});
