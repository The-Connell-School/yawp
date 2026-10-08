import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock(), findFirst: mock(), update: mock() },
  user: { findFirst: mock(), update: mock() },
  orgMembership: { create: mock(), findFirst: mock() },
  session: { create: mock(), deleteMany: mock() },
  password: { upsert: mock() },
  $executeRaw: mock(async () => undefined),
  $transaction: mock(),
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  getPasswordHash: async () => 'hash',
  getSessionExpirationDateForUser: () => new Date('2030-01-01'),
}));
const clearFailedLoginRateLimitsForTarget = mock(async () => undefined);
mock.module('~/utils/rate-limit.server', () => ({
  clearFailedLoginRateLimitsForTarget,
}));

afterAll(() => {
  mock.restore();
});

const {
  findFreeTierClassesByCode,
  registerFreeTierStudent,
  teacherResetStudentPassword,
} = await import('./student-join.server');

describe('student-join', () => {
  beforeEach(() => {
    Object.values(prisma).forEach((v) => {
      if (typeof v === 'object' && v && 'mockReset' in v) {
        (v as { mockReset: () => void }).mockReset();
      }
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma)
    );
  });

  test('findFreeTierClassesByCode scopes to FREE_CLASSROOM', async () => {
    prisma.class.findMany.mockResolvedValue([]);
    await findFreeTierClassesByCode('ABC');
    expect(prisma.class.findMany.mock.calls[0]?.[0].where.school.organization.plan).toBe(
      'FREE_CLASSROOM'
    );
  });

  test('registerFreeTierStudent rejects reserved handles', async () => {
    const result = await registerFreeTierStudent({
      name: 'Sam',
      username: 'admin',
      password: 'secret12',
      classId: 'class-1',
      joinToken: 'token-1',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.field).toBe('username');
    }
  });

  test('registerFreeTierStudent rejects unknown class token', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const result = await registerFreeTierStudent({
      name: 'Sam',
      username: 'sam123',
      password: 'secret12',
      classId: 'class-1',
      joinToken: 'bad-token',
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.formLevel).toBe(true);
    }
  });

  test('teacherResetStudentPassword requires teacher membership', async () => {
    prisma.orgMembership.findFirst.mockResolvedValueOnce(null);
    const result = await teacherResetStudentPassword({
      studentMembershipId: 'm1',
      classId: 'c1',
      organizationId: 'org',
      actorUserId: 'u1',
      temporaryPassword: 'temp-pass',
    });
    expect(result.status).toBe('error');
  });

  test('teacherResetStudentPassword updates password for eligible handle student', async () => {
    prisma.orgMembership.findFirst
      .mockResolvedValueOnce({ id: 'teacher-m' })
      .mockResolvedValueOnce({
        userId: 'student-user',
        user: {
          id: 'student-user',
          email: null,
          username: 'samstudent',
          isAdmin: false,
          isSuperAdmin: false,
          memberships: [{ role: 'STUDENT', isActive: true }],
        },
      });
    prisma.$transaction.mockResolvedValue([]);

    const result = await teacherResetStudentPassword({
      studentMembershipId: 'student-m',
      classId: 'c1',
      organizationId: 'org',
      actorUserId: 'teacher-user',
      temporaryPassword: 'temp-pass-1',
    });

    expect(result.status).toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(clearFailedLoginRateLimitsForTarget).toHaveBeenCalledWith({
      route: '/auth/login',
      targetKey: 'samstudent',
    });
  });
});
