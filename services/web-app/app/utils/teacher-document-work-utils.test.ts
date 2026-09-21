import { describe, expect, test } from 'bun:test';

import {
  buildReleaseGradeRows,
  buildTeacherUnsubmitRows,
  getTeacherDocumentWorkStatusDisplay,
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

describe('teacher document work grading display', () => {
  test('shows exact assignment points for non-Daily graded and released rows', () => {
    const base = documentRow({
      id: 'doc-points',
      assignment: {
        id: 'assignment-points',
        title: 'Point essay',
        submitForGrade: true,
        pointValue: 200,
      },
      submissions: [],
      latestSubmission: {
        id: 'submission-points',
        score: '91/200',
        numericPercentage: 46,
        gradedAt: new Date('2026-06-10T12:00:00.000Z'),
        releasedAt: null,
      },
    });

    expect(getTeacherDocumentWorkStatusDisplay(base).label).toBe(
      'Needs Releasing · 91 / 200'
    );

    expect(
      getTeacherDocumentWorkStatusDisplay({
        ...base,
        latestSubmission: {
          ...base.latestSubmission!,
          releasedAt: new Date('2026-06-11T12:00:00.000Z'),
        },
      }).label
    ).toBe('Released · 91 / 200');
  });
});

describe('buildTeacherUnsubmitRows', () => {
  test('returns selected active latest submissions with display-ready data', () => {
    const rows = buildTeacherUnsubmitRows([
      documentRow({
        id: 'doc-1',
        submissions: [],
        latestSubmission: {
          id: 'submission-latest',
          title: 'Submitted essay',
          score: '7/10',
          submittedAt: new Date('2026-06-12T12:00:00.000Z'),
        },
      }),
      documentRow({
        id: 'doc-2',
        submissions: [],
        latestSubmission: null,
      }),
    ]);

    expect(rows).toEqual([
      {
        id: 'submission-latest',
        score: '70 / 100',
        submittedAt: new Date('2026-06-12T12:00:00.000Z'),
        document: {
          id: 'doc-1',
          title: 'Submitted essay',
          membership: {
            user: { name: 'Alex Student', email: 'alex@example.com' },
          },
        },
      },
    ]);
  });
});
