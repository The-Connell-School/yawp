import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock(), findFirst: mock(), update: mock() },
  freeTierApplication: { count: mock() },
  user: { findFirst: mock(), update: mock() },
  orgMembership: { create: mock(), findFirst: mock(), count: mock() },
  invitation: { count: mock() },
  session: { create: mock(), deleteMany: mock() },
  password: { upsert: mock() },
  $executeRaw: mock(async () => undefined),
  $queryRaw: mock(async () => []),
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
    prisma.orgMembership.create.mockReset();
    prisma.session.create.mockReset();
    prisma.$queryRaw.mockResolvedValue([{ id: 'class-1' }] as never);
    prisma.orgMembership.count.mockResolvedValue(0);
    prisma.invitation.count.mockResolvedValue(0);
    prisma.freeTierApplication.count.mockResolvedValue(0);
    delete process.env.FREE_TIER_BUDGET_ENVIRONMENT;
    delete process.env.FREE_TIER_PREVIEW_BUDGET_USD;
    delete process.env.FREE_TIER_PREVIEW_UNIT_COST_USD;
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

  test('registerFreeTierStudent refuses over-budget joins before creating membership', async () => {
    process.env.FREE_TIER_BUDGET_ENVIRONMENT = 'preview';
    process.env.FREE_TIER_PREVIEW_BUDGET_USD = '0';
    process.env.FREE_TIER_PREVIEW_UNIT_COST_USD = '1';
    prisma.class.findFirst
      .mockResolvedValueOnce({
        id: 'class-1',
        school: { organizationId: 'org-free' },
      })
      .mockResolvedValueOnce({
        school: { organization: { plan: 'FREE_CLASSROOM' } },
      });

    const result = await registerFreeTierStudent({
      name: 'Sam',
      username: 'sam123',
      password: 'secret12',
      classId: 'class-1',
      joinToken: 'token-1',
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.formLevel).toBe(true);
      expect(result.error).toContain('not accepting new students');
    }
    expect(prisma.orgMembership.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('registerFreeTierStudent creates enrollment and session below the budget', async () => {
    prisma.class.findFirst
      .mockResolvedValueOnce({ id: 'class-1', school: { organizationId: 'org-free' } })
      .mockResolvedValueOnce({ school: { organization: { plan: 'FREE_CLASSROOM' } } });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.orgMembership.create.mockResolvedValue({ id: 'membership-1', userId: 'user-1' });
    prisma.session.create.mockResolvedValue({ id: 'session-1', expirationDate: new Date('2030-01-01') });
    const result = await registerFreeTierStudent({ name: 'Sam', username: 'sam123', password: 'secret12', classId: 'class-1', joinToken: 'token-1' });
    expect(result.status).toBe('ok');
    expect(prisma.orgMembership.create).toHaveBeenCalledTimes(1);
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
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
