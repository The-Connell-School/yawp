import { describe, expect, test } from 'bun:test';

import {
  buildReleaseGradeRows,
  formatClassLabel,
  getTeacherDocumentWorkStatusDisplay,
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

describe('getTeacherDocumentWorkStatusDisplay on work that is not for a grade', () => {
  const released = {
    id: 'submission-1',
    numericPercentage: 82,
    letterGrade: 'B',
    releasedAt: new Date('2026-06-11T12:00:00.000Z'),
    gradedAt: new Date('2026-06-11T11:00:00.000Z'),
  };

  test('says the feedback was released rather than leaving a bare status', () => {
    // There is no grade to append, and "Released" on its own reads as though
    // grading failed — which is what an exit ticket read for understanding
    // looked like.
    const display = getTeacherDocumentWorkStatusDisplay(
      documentRow({
        id: 'doc-1',
        assignment: {
          id: 'assignment-1',
          title: 'Exit ticket: balancing equations',
          submitForGrade: false,
          pointValue: null,
        },
        latestSubmission: released as never,
      })
    );

    expect(display.label).toContain('Feedback only');
    expect(display.label).not.toContain('82');
  });

  test('still appends the grade when the work is submitted for one', () => {
    const display = getTeacherDocumentWorkStatusDisplay(
      documentRow({
        id: 'doc-2',
        assignment: {
          id: 'assignment-2',
          title: 'Exit ticket: the water cycle',
          submitForGrade: true,
          pointValue: 10,
        },
        latestSubmission: released as never,
      })
    );

    expect(display.label).toContain('8 / 10');
    expect(display.label).not.toContain('Feedback only');
  });
});
