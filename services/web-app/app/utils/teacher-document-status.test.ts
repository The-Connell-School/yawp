import { describe, expect, test } from 'bun:test';
import {
  TEACHER_DOCUMENT_STATUSES,
  TEACHER_DOCUMENT_STATUS_BADGE_CLASSES,
  TEACHER_DOCUMENT_STATUS_LABELS,
  getTeacherDocumentStatus,
  hasMeaningfulGrade,
} from './teacher-document-status';

const ungradedSubmission = {
  score: null,
  feedback: null,
  rubricScores: null,
  overallComment: null,
  numericPercentage: null,
  letterGrade: null,
  gradedAt: null,
  releasedAt: null,
};

describe('hasMeaningfulGrade', () => {
  test('returns false when no grade signal is present', () => {
    expect(hasMeaningfulGrade(ungradedSubmission)).toBe(false);
  });

  test('returns false for empty rubricScores object', () => {
    expect(
      hasMeaningfulGrade({ ...ungradedSubmission, rubricScores: {} })
    ).toBe(false);
  });

  test.each([
    ['gradedAt', { gradedAt: new Date('2026-01-01') }],
    ['score', { score: '85' }],
    ['feedback', { feedback: 'Nice work' }],
    ['overallComment', { overallComment: 'Solid thesis' }],
    ['letterGrade', { letterGrade: 'B+' }],
    ['numericPercentage zero', { numericPercentage: 0 }],
    ['rubricScores', { rubricScores: { thesis: 4 } }],
  ])('returns true when %s is set', (_label, overrides) => {
    expect(hasMeaningfulGrade({ ...ungradedSubmission, ...overrides })).toBe(
      true
    );
  });
});

describe('getTeacherDocumentStatus', () => {
  test('no submission is in-progress', () => {
    expect(getTeacherDocumentStatus(null)).toBe('in-progress');
    expect(getTeacherDocumentStatus(undefined)).toBe('in-progress');
  });

  test('submission without meaningful grade needs grading', () => {
    expect(getTeacherDocumentStatus(ungradedSubmission)).toBe('needs-grading');
  });

  test('meaningful grade without release is graded', () => {
    expect(
      getTeacherDocumentStatus({
        ...ungradedSubmission,
        gradedAt: new Date('2026-01-01'),
      })
    ).toBe('graded');
    expect(
      getTeacherDocumentStatus({ ...ungradedSubmission, letterGrade: 'A' })
    ).toBe('graded');
  });

  test('released submission is released even without grade fields', () => {
    expect(
      getTeacherDocumentStatus({
        ...ungradedSubmission,
        releasedAt: new Date('2026-01-02'),
      })
    ).toBe('released');
  });

  test('accepts ISO string dates', () => {
    expect(
      getTeacherDocumentStatus({
        ...ungradedSubmission,
        gradedAt: '2026-01-01T00:00:00.000Z',
        releasedAt: '2026-01-02T00:00:00.000Z',
      })
    ).toBe('released');
  });
});

describe('status labels and badge classes', () => {
  test('uses the teacher-facing lifecycle labels', () => {
    expect(TEACHER_DOCUMENT_STATUS_LABELS).toEqual({
      'in-progress': 'In Progress',
      'needs-grading': 'Needs Grading',
      graded: 'Needs Releasing',
      released: 'Released',
    });
  });

  test('covers every status with the expected color family', () => {
    expect(TEACHER_DOCUMENT_STATUSES).toEqual([
      'in-progress',
      'needs-grading',
      'graded',
      'released',
    ]);
    expect(TEACHER_DOCUMENT_STATUS_BADGE_CLASSES['in-progress']).toContain(
      'muted'
    );
    expect(TEACHER_DOCUMENT_STATUS_BADGE_CLASSES['needs-grading']).toContain(
      'yellow'
    );
    expect(TEACHER_DOCUMENT_STATUS_BADGE_CLASSES.graded).toContain('blue');
    expect(TEACHER_DOCUMENT_STATUS_BADGE_CLASSES.released).toContain('green');
  });
});
