import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();
const createWritingPracticeAssignmentForClasses = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: classFindMany } },
}));

mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  createWritingPracticeAssignmentForClasses,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function requestWith(entries: Array<[string, string]>) {
  return new Request('https://example.test/app/writing-lessons/assign', {
    method: 'POST',
    body: new URLSearchParams(entries),
  });
}

describe('writing lessons assignment action', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    classFindMany.mockReset();
    createWritingPracticeAssignmentForClasses.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    classFindMany.mockResolvedValue([{ id: 'class-1' }]);
  });

  test('creates a lesson assignment for the teacher-owned classes', async () => {
    const response = await action({
      request: requestWith([
        ['lessonSlugs', 'revising-for-wordiness'],
        ['classIds', 'class-1'],
        ['title', 'Wordiness warm-up'],
        ['problemCount', '5'],
        ['dueAt', '2026-09-01'],
        ['instructions', 'Complete before class.'],
      ]),
      params: {},
      context: {} as never,
    } as any);

    expect(response.init?.status ?? 200).toBe(200);
    expect(response.data).toEqual({
      success: true,
      message: 'Practice assigned to 1 class.',
      classCount: 1,
    });
    expect(createWritingPracticeAssignmentForClasses).toHaveBeenCalledWith(
      {
        createdByMembershipId: 'teacher-1',
        title: 'Wordiness warm-up',
        lessonSlugs: ['revising-for-wordiness'],
        problemCount: 5,
        dueAt: new Date('2026-09-01'),
        instructions: 'Complete before class.',
      },
      ['class-1']
    );
  });

  test('rejects assignment creation by a student', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });

    const response = await action({
      request: requestWith([]),
      params: {},
      context: {} as never,
    } as any);

    expect(response.init?.status).toBe(403);
    expect(response.data.message).toBe(
      'Only teachers can assign writing practice.'
    );
  });

  test('rejects classes the teacher does not own', async () => {
    classFindMany.mockResolvedValue([]);

    const response = await action({
      request: requestWith([
        ['lessonSlugs', 'revising-for-wordiness'],
        ['classIds', 'class-other'],
        ['title', 'Wordiness warm-up'],
        ['problemCount', '5'],
        ['dueAt', '2026-09-01'],
      ]),
      params: {},
      context: {} as never,
    } as any);

    expect(response.init?.status).toBe(403);
    expect(response.data.message).toBe(
      'You can only assign to your own classes.'
    );
  });
});
