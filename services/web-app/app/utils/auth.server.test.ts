import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findFirst: mock(),
    findUnique: mock(),
    update: mock(),
  },
};

mock.module('./db.server.ts', () => ({ prisma }));

const { getPasswordHash, resetUserPassword, verifyUserPassword } =
  await import('./auth.server.ts');

describe('auth email normalization', () => {
  beforeEach(() => {
    prisma.user.findFirst.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.user.update.mockReset();
  });

  test('verifyUserPassword looks up user email case-insensitively', async () => {
    const password = 'Passw0rd!234';
    const hash = await getPasswordHash(password);

    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      password: { hash },
    });

    const result = await verifyUserPassword(
      { email: 'Teacher.Invited@Example.COM' },
      password
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'teacher.invited@example.com',
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        password: { select: { hash: true } },
      },
    });
    expect(result).toEqual({ id: 'user-1' });
  });

  test('resetUserPassword updates password for mixed-case stored email', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'Teacher.Invited@Example.COM',
    });

    await resetUserPassword({
      email: 'teacher.invited@example.com',
      password: 'new-password-123',
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'teacher.invited@example.com',
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update.mock.calls[0]?.[0]?.where).toEqual({
      id: 'user-1',
    });
  });
});
