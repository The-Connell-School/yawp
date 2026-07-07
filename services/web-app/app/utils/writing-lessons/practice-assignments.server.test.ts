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
  buildAssignedPracticeSequence,
  summarizeWritingPracticeResults,
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

describe('buildAssignedPracticeSequence', () => {
  test('produces the requested number of problems from a single lesson', () => {
    const sequence = buildAssignedPracticeSequence(['fixing-comma-splices'], 3);

    expect(sequence).toHaveLength(3);
    expect(sequence.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(
      sequence.every((item) => item.lessonSlug === 'fixing-comma-splices')
    ).toBe(true);
    expect(sequence[0].lessonTitle).toBe('Fixing Comma Splices');
  });

  test('cycles prompts when problemCount exceeds available prompts', () => {
    const sequence = buildAssignedPracticeSequence(['fixing-comma-splices'], 6);

    // Only 4 distinct prompts exist, so #5 reuses the first prompt.
    expect(sequence).toHaveLength(6);
    expect(sequence[4].prompt.id).toBe(sequence[0].prompt.id);
  });

  test('interleaves prompts across multiple lessons', () => {
    const sequence = buildAssignedPracticeSequence(
      ['fixing-comma-splices', 'revising-for-wordiness'],
      4
    );

    expect(sequence.map((item) => item.lessonSlug)).toEqual([
      'fixing-comma-splices',
      'revising-for-wordiness',
      'fixing-comma-splices',
      'revising-for-wordiness',
    ]);
  });

  test('returns an empty sequence for no problems or unknown lessons', () => {
    expect(buildAssignedPracticeSequence(['fixing-comma-splices'], 0)).toEqual(
      []
    );
    expect(buildAssignedPracticeSequence(['not-a-lesson'], 3)).toEqual([]);
  });
});

describe('summarizeWritingPracticeResults', () => {
  const students = [
    { id: 's-2', user: { name: 'Bianca', email: 'bianca@example.com' } },
    { id: 's-1', user: { name: 'Aaron', email: 'aaron@example.com' } },
    { id: 's-3', user: { name: null, email: 'cara@example.com' } },
  ];

  test('rolls attempts up per student, sorted by email, marking completion', () => {
    const results = summarizeWritingPracticeResults({
      students,
      problemCount: 2,
      attempts: [
        {
          membershipId: 's-1',
          status: 'developing',
          createdAt: new Date('2026-07-01T10:00:00Z'),
        },
        {
          membershipId: 's-1',
          status: 'strong',
          createdAt: new Date('2026-07-01T11:00:00Z'),
        },
        {
          membershipId: 's-2',
          status: 'needs_revision',
          createdAt: new Date('2026-07-01T09:00:00Z'),
        },
      ],
    });

    expect(results.map((r) => r.email)).toEqual([
      'aaron@example.com',
      'bianca@example.com',
      'cara@example.com',
    ]);

    const aaron = results[0];
    expect(aaron.attemptCount).toBe(2);
    expect(aaron.completed).toBe(true);
    expect(aaron.latestStatus).toBe('strong'); // most recent wins

    const bianca = results[1];
    expect(bianca.attemptCount).toBe(1);
    expect(bianca.completed).toBe(false);

    const cara = results[2];
    expect(cara.attemptCount).toBe(0);
    expect(cara.completed).toBe(false);
    expect(cara.latestStatus).toBeNull();
  });
});
