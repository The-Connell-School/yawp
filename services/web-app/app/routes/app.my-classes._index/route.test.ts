import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
  orgMembership: { findUnique: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const getTeacherClassCardStats = mock();
const getStudentEnrolledClasses = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/teacher-class-card-stats.server', () => ({
  getTeacherClassCardStats,
}));
mock.module('~/utils/student-classes.server', () => ({
  getStudentEnrolledClasses,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

describe('my classes route (student branch)', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
    prisma.orgMembership.findUnique.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    getTeacherClassCardStats.mockReset();
    getStudentEnrolledClasses.mockReset();

    requireUserId.mockResolvedValue('user-1');
  });

  test('a student sees their enrolled classes instead of being redirected', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    getStudentEnrolledClasses.mockResolvedValue([
      {
        id: 'class-1',
        grade: '9',
        period: '1',
        title: 'History',
        classArtKey: null,
        legacyClassArtIndex: null,
        school: { id: 'school-1', name: 'E2E High' },
        teacherNames: ['Mrs Test Teacher'],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/my-classes'),
      params: {},
      context: {} as never,
    } as any);

    expect(getStudentEnrolledClasses).toHaveBeenCalledWith('profile-1');
    const data = response.data as any;
    expect(data.role).toBe('STUDENT');
    expect(data.studentClasses).toHaveLength(1);
  });

  test('a teacher still gets the existing teacher class list, unaffected', async () => {
    requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    prisma.class.findMany.mockResolvedValue([]);
    prisma.orgMembership.findUnique.mockResolvedValue({ schools: [] });

    const response = await loader({
      request: new Request('https://example.test/app/my-classes'),
      params: {},
      context: {} as never,
    } as any);

    expect(getStudentEnrolledClasses).not.toHaveBeenCalled();
    const data = response.data as any;
    expect(data.role).toBe('TEACHER');
    expect(data.classes).toEqual([]);
  });
});
