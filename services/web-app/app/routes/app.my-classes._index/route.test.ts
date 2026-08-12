import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock(), create: mock(), update: mock(), findFirst: mock() },
  orgMembership: { findUnique: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const getTeacherClassCardStats = mock();
const getStudentEnrolledClasses = mock();
const pickClassArtKeyForOrganization = mock();

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
mock.module('~/utils/class-art-assignment.server', () => ({
  pickClassArtKeyForOrganization,
}));

const { loader, action } = await import('./route');

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
    pickClassArtKeyForOrganization.mockReset();
    prisma.class.create.mockReset();
    prisma.class.update.mockReset();
    prisma.class.findFirst.mockReset();

    requireUserId.mockResolvedValue('user-1');
    pickClassArtKeyForOrganization.mockResolvedValue('art-key-1');
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

    // The second argument is the resolved school year: students never pick
    // one, the loader hands them the year their work is in.
    expect(getStudentEnrolledClasses).toHaveBeenCalledWith(
      'profile-1',
      expect.any(String)
    );
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

describe('my classes route (teacher create/edit)', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
    prisma.orgMembership.findUnique.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    pickClassArtKeyForOrganization.mockReset();
    prisma.class.create.mockReset();
    prisma.class.update.mockReset();
    prisma.class.findFirst.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    prisma.orgMembership.findUnique.mockResolvedValue({
      schools: [{ id: 'school-1' }],
    });
    pickClassArtKeyForOrganization.mockResolvedValue('art-key-1');
  });

  test('create-class allows a missing period', async () => {
    prisma.class.create.mockResolvedValue({ id: 'class-1' });

    const body = new URLSearchParams();
    body.set('intent', 'create-class');
    body.set('schoolId', 'school-1');
    body.set('schoolYear', '2025-2026');
    body.set('grade', '9');
    body.set('code', 'ABC123');

    const request = new Request('https://example.test/app/my-classes?index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = (await action({ request } as any)) as {
      data: { success: boolean };
    };

    expect(result.data.success).toBe(true);
    expect(prisma.class.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ period: null }),
      })
    );
  });

  test('edit-class allows clearing the period to null', async () => {
    prisma.class.findFirst.mockResolvedValue({
      teachers: [{ id: 'teacher-1' }],
    });
    prisma.class.update.mockResolvedValue({ id: 'class-1' });

    const body = new URLSearchParams();
    body.set('intent', 'edit-class');
    body.set('classId', 'class-1');
    body.set('schoolId', 'school-1');
    body.set('schoolYear', '2025-2026');
    body.set('code', 'ABC123');

    const request = new Request('https://example.test/app/my-classes?index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = (await action({ request } as any)) as {
      data: { success: boolean };
    };

    expect(result.data.success).toBe(true);
    expect(prisma.class.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ period: null, grade: null }),
      })
    );
  });

  test('create-class allows a missing grade', async () => {
    prisma.class.create.mockResolvedValue({ id: 'class-1' });

    const body = new URLSearchParams();
    body.set('intent', 'create-class');
    body.set('schoolId', 'school-1');
    body.set('schoolYear', '2025-2026');
    body.set('code', 'ABC123');

    const request = new Request('https://example.test/app/my-classes?index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result = (await action({ request } as any)) as {
      data: { success: boolean };
    };

    expect(result.data.success).toBe(true);
    expect(prisma.class.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ grade: null }),
      })
    );
  });
});
