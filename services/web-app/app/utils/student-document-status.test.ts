import { describe, expect, test } from 'bun:test';

import {
  STUDENT_DOCUMENT_STATUSES,
  STUDENT_DOCUMENT_STATUS_LABELS,
  countStudentDocumentStatuses,
  getStudentDocumentStatus,
} from './student-document-status';

describe('getStudentDocumentStatus', () => {
  test('a document with no submissions is still in progress', () => {
    expect(getStudentDocumentStatus([])).toBe('in-progress');
  });

  test('a document with a live submission is submitted', () => {
    expect(
      getStudentDocumentStatus([
        { id: 's1', submittedAt: new Date(), releasedAt: null },
      ])
    ).toBe('submitted');
  });

  test('a released submission reads as graded', () => {
    expect(
      getStudentDocumentStatus([
        { id: 's1', submittedAt: new Date(), releasedAt: new Date() },
      ])
    ).toBe('graded');
  });

  test('a graded-but-unreleased submission still reads as submitted', () => {
    // Students never see the teacher-side "Needs Grading" / "Needs Releasing"
    // split. Until a grade is released it is simply submitted.
    expect(
      getStudentDocumentStatus([
        { id: 's1', submittedAt: new Date(), releasedAt: null },
      ])
    ).toBe('submitted');
  });

  test('archived submissions do not count as submitted', () => {
    expect(
      getStudentDocumentStatus([
        {
          id: 's1',
          submittedAt: new Date(),
          releasedAt: null,
          archivedAt: new Date(),
        },
      ])
    ).toBe('in-progress');
  });

  test('unsubmitted submissions do not count as submitted', () => {
    expect(
      getStudentDocumentStatus([
        {
          id: 's1',
          submittedAt: new Date(),
          releasedAt: null,
          unsubmittedAt: new Date(),
        },
      ])
    ).toBe('in-progress');
  });

  test('an archived released submission does not make the document graded', () => {
    expect(
      getStudentDocumentStatus([
        {
          id: 's1',
          submittedAt: new Date(),
          releasedAt: new Date(),
          archivedAt: new Date(),
        },
        { id: 's2', submittedAt: new Date(), releasedAt: null },
      ])
    ).toBe('submitted');
  });

  test('a newer revision awaiting grading takes priority over an older released grade', () => {
    expect(
      getStudentDocumentStatus([
        {
          id: 's2',
          submittedAt: '2024-03-01T00:00:00.000Z',
          releasedAt: null,
        },
        {
          id: 's1',
          submittedAt: '2024-02-01T00:00:00.000Z',
          releasedAt: '2024-02-02T00:00:00.000Z',
        },
      ])
    ).toBe('submitted');
  });
});

describe('student document status vocabulary', () => {
  test('exposes exactly the three states a student can observe', () => {
    expect(STUDENT_DOCUMENT_STATUSES).toEqual([
      'in-progress',
      'submitted',
      'graded',
    ]);
  });

  test('labels match the badges already shown on student document cards', () => {
    expect(STUDENT_DOCUMENT_STATUS_LABELS).toEqual({
      'in-progress': 'In Progress',
      submitted: 'Submitted',
      graded: 'Graded',
    });
  });
});

describe('countStudentDocumentStatuses', () => {
  test('counts every status, including the ones with no documents', () => {
    const counts = countStudentDocumentStatuses([
      { submissions: [] },
      { submissions: [] },
      { submissions: [{ id: 's1', releasedAt: null }] },
      { submissions: [{ id: 's2', releasedAt: new Date() }] },
    ]);

    expect(counts).toEqual({
      'in-progress': 2,
      submitted: 1,
      graded: 1,
    });
  });
});
