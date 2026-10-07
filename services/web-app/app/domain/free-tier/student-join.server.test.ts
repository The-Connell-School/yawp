import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock(), findFirst: mock() },
  user: { findFirst: mock() },
  orgMembership: { create: mock(), findFirst: mock() },
  session: { create: mock() },
  password: { upsert: mock() },
  $transaction: mock(),
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  getPasswordHash: async () => 'hash',
  getSessionExpirationDateForUser: () => new Date('2030-01-01'),
}));

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
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) await op;
    });
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
    });
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.field).toBe('username');
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
});
