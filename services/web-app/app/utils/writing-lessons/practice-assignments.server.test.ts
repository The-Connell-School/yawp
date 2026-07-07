import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PracticeFeedbackResult } from './practice-feedback.shared';

const writingPracticeAssignment = { create: mock() };
const writingPracticeAttempt = { create: mock() };
const writingPracticeClassAssignment = { findMany: mock(), findFirst: mock() };

mock.module('~/utils/db.server', () => ({
  prisma: {
    writingPracticeAssignment,
    writingPracticeAttempt,
    writingPracticeClassAssignment,
  },
}));

const {
  createWritingPracticeAssignmentForClasses,
  recordWritingPracticeAttempt,
  getAssignedPracticeForStudent,
} = await import('./practice-assignments.server');

beforeEach(() => {
  writingPracticeAssignment.create.mockReset();
  writingPracticeAttempt.create.mockReset();
  writingPracticeClassAssignment.findMany.mockReset();
  writingPracticeClassAssignment.findFirst.mockReset();
});

describe('createWritingPracticeAssignmentForClasses', () => {
  test('creates one assignment and deploys to de-duplicated classes', async () => {
    writingPracticeAssignment.create.mockResolvedValueOnce({ id: 'wpa-1' });

    await createWritingPracticeAssignmentForClasses(
      {
        createdByMembershipId: 'teacher-1',
        title: 'Comma week',
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 3,
        dueAt: null,
        instructions: null,
      },
      ['class-a', 'class-a', 'class-b']
    );

    expect(writingPracticeAssignment.create).toHaveBeenCalledTimes(1);
    const arg = writingPracticeAssignment.create.mock.calls[0][0];
    expect(arg.data.createdByMembershipId).toBe('teacher-1');
    expect(arg.data.lessonSlugs).toEqual(['fixing-comma-splices']);
    expect(arg.data.problemCount).toBe(3);
    expect(arg.data.classAssignments.create).toEqual([
      { classId: 'class-a' },
      { classId: 'class-b' },
    ]);
  });
});

describe('recordWritingPracticeAttempt', () => {
  test('maps feedback status/json onto the persisted attempt', async () => {
    writingPracticeAttempt.create.mockResolvedValueOnce({ id: 'att-1' });
    const feedback: PracticeFeedbackResult = {
      status: 'strong',
      summary: 'Clean fix.',
      strengths: ['Semicolon joins two clauses.'],
      focus: ['Check both sides stand alone.'],
      encouragement: 'Nice.',
      degraded: false,
    };

    await recordWritingPracticeAttempt({
      classAssignmentId: 'wpca-1',
      membershipId: 'student-1',
      lessonSlug: 'fixing-comma-splices',
      promptId: 'fixing-comma-splices-1',
      exercise: 'A, B.',
      instruction: 'Fix it.',
      response: 'A; B.',
      feedback,
    });

    const arg = writingPracticeAttempt.create.mock.calls[0][0];
    expect(arg.data.status).toBe('strong');
    expect(arg.data.feedbackJson).toEqual(feedback);
    expect(arg.data.membershipId).toBe('student-1');
    expect(arg.data.classAssignmentId).toBe('wpca-1');
  });
});

describe('getAssignedPracticeForStudent', () => {
  test('scopes to the student’s classes and only their attempts', async () => {
    writingPracticeClassAssignment.findMany.mockResolvedValueOnce([]);

    await getAssignedPracticeForStudent('student-1');

    const arg = writingPracticeClassAssignment.findMany.mock.calls[0][0];
    expect(arg.where.class.students.some.id).toBe('student-1');
    expect(arg.include.attempts.where.membershipId).toBe('student-1');
  });
});
