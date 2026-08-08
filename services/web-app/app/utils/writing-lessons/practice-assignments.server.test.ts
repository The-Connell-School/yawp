import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const writingPracticeAssignmentCreate = mock();
const writingPracticeAssignmentFindMany = mock();

mock.module('~/utils/db.server', () => ({
  prisma: {
    writingPracticeAssignment: {
      create: writingPracticeAssignmentCreate,
      findMany: writingPracticeAssignmentFindMany,
    },
  },
}));

const {
  createWritingPracticeAssignmentForClasses,
  listWritingPracticeAssignmentsForStudent,
  listWritingPracticeAssignmentsForTeacher,
} = await import('./practice-assignments.server');

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

describe('listing writing practice assignments', () => {
  const row = {
    id: 'practice-1',
    title: 'Wordiness warm-up',
    lessonSlugs: ['revising-for-wordiness'],
    problemCount: 5,
    dueAt: new Date('2026-09-01T00:00:00.000Z'),
    instructions: 'Complete before class.',
    classAssignments: [
      {
        class: {
          id: 'class-1',
          title: 'English 9',
          grade: '9',
          period: '2',
        },
      },
    ],
  };

  beforeEach(() => {
    writingPracticeAssignmentFindMany.mockReset();
    writingPracticeAssignmentFindMany.mockResolvedValue([row]);
  });

  test('flattens class deployments onto the assignment summary', async () => {
    const assignments =
      await listWritingPracticeAssignmentsForTeacher('teacher-1');

    expect(assignments).toEqual([
      {
        id: 'practice-1',
        title: 'Wordiness warm-up',
        lessonSlugs: ['revising-for-wordiness'],
        problemCount: 5,
        dueAt: new Date('2026-09-01T00:00:00.000Z'),
        instructions: 'Complete before class.',
        classes: [
          { id: 'class-1', title: 'English 9', grade: '9', period: '2' },
        ],
      },
    ]);
  });

  test('scopes the teacher list to active classes they teach', async () => {
    await listWritingPracticeAssignmentsForTeacher('teacher-1');

    const [args] = writingPracticeAssignmentFindMany.mock.calls[0];
    const classFilter = {
      isArchived: false,
      teachers: { some: { id: 'teacher-1' } },
    };

    expect(args.where).toEqual({
      classAssignments: { some: { class: classFilter } },
    });
    expect(args.select.classAssignments.where).toEqual({ class: classFilter });
    expect(args.orderBy).toEqual([{ dueAt: 'asc' }, { createdAt: 'desc' }]);
  });

  test('scopes the student list to active classes they are enrolled in', async () => {
    await listWritingPracticeAssignmentsForStudent('student-1');

    const [args] = writingPracticeAssignmentFindMany.mock.calls[0];
    const classFilter = {
      isArchived: false,
      students: { some: { id: 'student-1' } },
    };

    expect(args.where).toEqual({
      classAssignments: { some: { class: classFilter } },
    });
    expect(args.select.classAssignments.where).toEqual({ class: classFilter });
  });
});
