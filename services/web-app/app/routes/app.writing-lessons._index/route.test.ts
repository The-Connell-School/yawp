import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    class: { findMany: classFindMany },
  },
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

describe('writing lessons index route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    classFindMany.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    classFindMany.mockResolvedValue([]);
  });

  test('loads by direct URL when the org has writing practice enabled', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.lessonCount).toBeGreaterThan(0);
    expect(response.data.promptCount).toBeGreaterThan(0);
  });

  test('redirects to the dashboard when the org has writing practice disabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      loader({
        request: new Request('https://example.test/app/writing-lessons'),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
  });

  test('loads active classes for a teacher creating a practice assignment', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    classFindMany.mockResolvedValue([
      { id: 'class-1', title: 'English 9', grade: '9th', period: '1st' },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.isTeacher).toBe(true);
    expect(response.data.teacherClasses).toEqual([
      { id: 'class-1', title: 'English 9', grade: '9th', period: '1st' },
    ]);
    expect(classFindMany).toHaveBeenCalledWith({
      where: {
        teachers: { some: { id: 'teacher-1' } },
        isArchived: false,
      },
      orderBy: [{ title: 'asc' }, { grade: 'asc' }, { period: 'asc' }],
      select: { id: true, title: true, grade: true, period: true },
    });
  });
});
