import { describe, expect, test } from 'bun:test';

import {
  buildTeacherDocumentWorkGroups,
  collapsedGroupKeysForGroups,
  type TeacherDocumentWorkGroup,
} from '~/utils/teacher-document-work-grouping';
import type { TeacherDocumentWorkRow } from '~/utils/teacher-document-work-utils';

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

describe('buildTeacherDocumentWorkGroups', () => {
  test('groups documents by lifecycle status in workflow order', () => {
    const groups = buildTeacherDocumentWorkGroups({
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
  });

  test('groups documents by class label', () => {
    const groups = buildTeacherDocumentWorkGroups({
      documents: [
        row({
          id: 'doc-a',
          resolvedClass: {
            id: 'class-a',
            grade: '10th',
            period: '2nd',
            title: 'Honors',
          },
        }),
        row({
          id: 'doc-b',
          resolvedClass: {
            id: 'class-b',
            grade: '9th',
            period: '1st',
            title: null,
          },
        }),
      ],
      mode: 'class',
      collator,
    });

    expect(groups.map((group: TeacherDocumentWorkGroup) => group.label)).toEqual([
      'Grade 9th • Period 1st',
      'Honors · Grade 10th • Period 2nd',
    ]);
  });
});

describe('collapsedGroupKeysForGroups', () => {
  test('returns every group key except the flat list bucket', () => {
    expect(
      collapsedGroupKeysForGroups([
        { key: 'all' },
        { key: 'student-1' },
        { key: 'student-2' },
      ])
    ).toEqual(new Set(['student-1', 'student-2']));
  });
});
