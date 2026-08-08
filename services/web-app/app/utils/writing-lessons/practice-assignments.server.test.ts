import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const writingPracticeAssignmentCreate = mock();

mock.module('~/utils/db.server', () => ({
  prisma: {
    writingPracticeAssignment: { create: writingPracticeAssignmentCreate },
  },
}));

const { createWritingPracticeAssignmentForClasses } =
  await import('./practice-assignments.server');

afterAll(() => {
  mock.restore();
});

describe('writing practice assignments', () => {
  beforeEach(() => {
    writingPracticeAssignmentCreate.mockReset();
    writingPracticeAssignmentCreate.mockResolvedValue({ id: 'practice-1' });
  });

  test('creates one assignment and de-duplicates its class deployments', async () => {
    await createWritingPracticeAssignmentForClasses(
      {
        createdByMembershipId: 'teacher-1',
        title: 'Wordiness warm-up',
        lessonSlugs: ['revising-for-wordiness'],
        problemCount: 5,
        dueAt: new Date('2026-09-01T00:00:00.000Z'),
        instructions: 'Complete before class.',
      },
      ['class-1', 'class-1', 'class-2']
    );

    expect(writingPracticeAssignmentCreate).toHaveBeenCalledWith({
      data: {
        createdByMembershipId: 'teacher-1',
        title: 'Wordiness warm-up',
        lessonSlugs: ['revising-for-wordiness'],
        problemCount: 5,
        dueAt: new Date('2026-09-01T00:00:00.000Z'),
        instructions: 'Complete before class.',
        classAssignments: {
          create: [{ classId: 'class-1' }, { classId: 'class-2' }],
        },
      },
      include: { classAssignments: true },
    });
  });
});
