import { describe, expect, test } from 'bun:test';

import {
  buildReleaseGradeRows,
  formatClassLabel,
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

  test('keeps the title suffix when period is null', () => {
    expect(
      formatClassLabel({
        id: 'c1',
        grade: '9',
        period: null,
        title: 'Honors',
      })
    ).toBe('Grade 9 — Honors');
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
