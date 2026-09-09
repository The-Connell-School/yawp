import { describe, expect, test } from 'bun:test';

import {
  buildReleaseGradeRows,
  formatClassLabel,
  getTeacherDocumentWorkDetailLink,
  type TeacherDocumentWorkRow,
} from './teacher-document-work-utils';

describe('formatClassLabel', () => {
  test('includes the period when present', () => {
    expect(
      formatClassLabel({ id: 'c1', grade: '9', period: '2', title: null })
    ).toBe('Grade 9 • Period 2');
  });

  test('omits the period segment when period is null', () => {
    expect(
      formatClassLabel({ id: 'c1', grade: '9', period: null, title: null })
    ).toBe('Grade 9');
  });

  test('leads with title for combined labels', () => {
    expect(
      formatClassLabel({
        id: 'c1',
        grade: '9',
        period: null,
        title: 'Honors',
      })
    ).toBe('Honors · Grade 9');
  });

  test('still renders a usable label when grade and period are both null', () => {
    expect(
      formatClassLabel({ id: 'c1', grade: null, period: null, title: null })
    ).toBe('Untitled Class');
  });
});

function documentRow(
  overrides: Partial<TeacherDocumentWorkRow> &
    Pick<TeacherDocumentWorkRow, 'id'>
): TeacherDocumentWorkRow {
  return {
    title: 'Draft title',
    updatedAt: new Date('2026-06-01T12:00:00.000Z'),
    membership: {
      id: 'student-1',
      user: { name: 'Alex Student', email: 'alex@example.com' },
    },
    assignment: {
      id: 'assignment-1',
      title: 'Essay One',
      submitForGrade: true,
      pointValue: 100,
    },
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

describe('buildReleaseGradeRows', () => {
  test('returns graded unreleased submissions with display-ready release data', () => {
    const releaseRows = buildReleaseGradeRows([
      documentRow({
        id: 'doc-1',
        submissions: [
          {
            id: 'submission-graded',
            title: 'Final essay',
            numericPercentage: 88,
            letterGrade: 'B+',
            feedback: 'Strong evidence.',
            archivedAt: new Date('2026-06-10T12:00:00.000Z'),
            releasedAt: null,
          },
          {
            id: 'submission-released',
            title: 'Released essay',
            numericPercentage: 91,
            releasedAt: new Date('2026-06-11T12:00:00.000Z'),
          },
          {
            id: 'submission-ungraded',
            title: 'Ungraded essay',
            releasedAt: null,
          },
        ],
      }),
    ]);

    expect(releaseRows).toEqual([
      {
        id: 'submission-graded',
        score: '88 / 100',
        feedback: 'Strong evidence.',
        archivedAt: new Date('2026-06-10T12:00:00.000Z'),
        document: {
          id: 'doc-1',
          title: 'Final essay',
          membership: {
            user: { name: 'Alex Student', email: 'alex@example.com' },
          },
        },
      },
    ]);
  });
});

describe('getTeacherDocumentWorkDetailLink', () => {
  const baseRow = {
    id: 'doc-1',
    title: 'International expansion brief',
    updatedAt: new Date('2026-09-08T12:00:00Z'),
    membership: { id: 'm-1', user: { name: 'Sam Student', email: 's@x.test' } },
    assignment: { id: 'a-1', title: "GBA 300: Int'l Expansion Plan" },
    resolvedClass: null,
    submissions: [],
    latestSubmission: null,
    submissionCount: 0,
  } satisfies TeacherDocumentWorkRow;

  const group = {
    id: 'g-1',
    label: 'Group 1',
    members: [
      {
        membershipId: 'm-1',
        membership: {
          id: 'm-1',
          user: { name: 'Sam Student', email: 's@x.test' },
        },
      },
    ],
  };

  test('sends an unsubmitted group draft to the group page', () => {
    expect(
      getTeacherDocumentWorkDetailLink({
        document: { ...baseRow, group },
        exitTo: '/app/my-classes/c-1',
      })
    ).toBe('/app/group-drafts/doc-1?exitTo=%2Fapp%2Fmy-classes%2Fc-1');
  });

  test('keeps a submitted group draft on the group page', () => {
    // The whole point: a group's work looks the same before and after it is
    // handed in. Routing a submitted group to the solo submission page dropped
    // the contribution table, the colour-coded draft and the individual grade
    // cards the moment the group pressed submit, which read as two unrelated
    // screens for the same assignment.
    expect(
      getTeacherDocumentWorkDetailLink({
        document: {
          ...baseRow,
          group,
          latestSubmission: { id: 'sub-1', submittedAt: '2026-09-08' },
          submissionCount: 1,
        },
        exitTo: '/app/my-classes/c-1',
      })
    ).toBe('/app/group-drafts/doc-1?exitTo=%2Fapp%2Fmy-classes%2Fc-1');
  });

  test('keeps a graded group draft on the group page', () => {
    expect(
      getTeacherDocumentWorkDetailLink({
        document: {
          ...baseRow,
          group,
          latestSubmission: {
            id: 'sub-1',
            submittedAt: '2026-09-08',
            score: 'A- (91)',
            gradedAt: '2026-09-09',
            releasedAt: '2026-09-09',
          },
          submissionCount: 1,
        },
        exitTo: '/app/my-classes/c-1',
      })
    ).toBe('/app/group-drafts/doc-1?exitTo=%2Fapp%2Fmy-classes%2Fc-1');
  });

  test('still sends a submitted solo document to its submission', () => {
    expect(
      getTeacherDocumentWorkDetailLink({
        document: {
          ...baseRow,
          latestSubmission: { id: 'sub-9', submittedAt: '2026-09-08' },
          submissionCount: 1,
        },
        exitTo: '/app/my-classes/c-1',
      })
    ).toBe('/app/submissions/sub-9?edit=1&exitTo=%2Fapp%2Fmy-classes%2Fc-1');
  });

  test('still sends an unsubmitted solo document to the editor', () => {
    expect(
      getTeacherDocumentWorkDetailLink({
        document: baseRow,
        exitTo: '/app/my-classes/c-1',
      })
    ).toBe('/app/documents/doc-1?left=tutor&exitTo=%2Fapp%2Fmy-classes%2Fc-1');
  });
});
