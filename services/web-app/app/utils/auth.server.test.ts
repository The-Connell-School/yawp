import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findFirst: mock(),
    findUnique: mock(),
    update: mock(),
  },
  orgMembership: {
    findUnique: mock(),
    findFirst: mock(),
  },
  session: {
    findUnique: mock(),
  },
};

const getMembershipId = mock();
const setMembershipId = mock();
const getSession = mock();

mock.module('./db.server.ts', () => ({ prisma }));
mock.module('~/cookies/membership-id.server', () => ({
  getMembershipId,
  setMembershipId,
}));
mock.module('../cookie-session-storages/authentication.server.ts', () => ({
  authSessionStorage: {
    getSession,
    destroySession: mock(),
  },
}));

const {
  getPasswordHash,
  resetUserPassword,
  verifyUserPassword,
  requireMembership,
  requireAdmin,
  requireOwner,
  isTeacherMembership,
  isStudentMembership,
} = await import('./auth.server.ts');

const membershipFixture = {
  id: 'membership-1',
  role: 'TEACHER' as const,
  isOrgOwner: false,
  organization: {
    id: 'org-1',
    name: 'Yawp Org',
    reporterEnabled: false,
    classInsightsEnabled: false,
    lessonPlannerEnabled: false,
  },
};

describe('membership auth helpers', () => {
  beforeEach(() => {
    getMembershipId.mockReset();
    setMembershipId.mockReset();
    getSession.mockReset();
    prisma.orgMembership.findUnique.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    prisma.user.findFirst.mockReset();
    prisma.session.findUnique.mockReset();
    setMembershipId.mockResolvedValue('membership-id=; Path=/');
  });

  test('isTeacherMembership and isStudentMembership check role', () => {
    expect(isTeacherMembership({ role: 'TEACHER' })).toBe(true);
    expect(isTeacherMembership({ role: 'STUDENT' })).toBe(false);
    expect(isStudentMembership({ role: 'STUDENT' })).toBe(true);
    expect(isStudentMembership({ role: 'TEACHER' })).toBe(false);
  });

  test('requireMembership returns cookie-selected membership', async () => {
    getMembershipId.mockResolvedValue('membership-1');
    prisma.orgMembership.findUnique.mockResolvedValue(membershipFixture);

    const membership = await requireMembership(
      new Request('https://example.com/app'),
      'user-1'
    );

    expect(prisma.orgMembership.findUnique).toHaveBeenCalledWith({
      where: { id: 'membership-1', userId: 'user-1' },
      select: {
        id: true,
        role: true,
        isOrgOwner: true,
        organization: {
          select: {
            id: true,
            name: true,
            reporterEnabled: true,
            classInsightsEnabled: true,
            lessonPlannerEnabled: true,
          },
        },
      },
    });
    expect(membership).toEqual(membershipFixture);
  });

  test('requireMembership falls back to first membership when cookie is missing', async () => {
    getMembershipId.mockResolvedValue('');
    prisma.orgMembership.findFirst.mockResolvedValue(membershipFixture);

    const membership = await requireMembership(
      new Request('https://example.com/app'),
      'user-1'
    );

    expect(prisma.orgMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        isOrgOwner: true,
        organization: {
          select: {
            id: true,
            name: true,
            reporterEnabled: true,
            classInsightsEnabled: true,
            lessonPlannerEnabled: true,
          },
        },
      },
    });
    expect(membership).toEqual(membershipFixture);
  });

  test('requireOwner checks memberships with isOrgOwner', async () => {
    getSession.mockResolvedValue({
      get: (key: string) => (key === 'sessionId' ? 'session-1' : undefined),
    });
    prisma.session.findUnique.mockResolvedValue({
      user: { id: 'user-1' },
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [{ id: 'membership-1', isOrgOwner: true }],
    });

    const user = await requireOwner(
      new Request('https://example.com/app/organization', {
        method: 'GET',
        headers: { cookie: 'en_session=signed-cookie' },
      })
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      select: {
        id: true,
        memberships: { select: { id: true, isOrgOwner: true } },
      },
      where: {
        id: 'user-1',
        memberships: { some: { isOrgOwner: true } },
      },
    });
    expect(user).toEqual({
      id: 'user-1',
      memberships: [{ id: 'membership-1', isOrgOwner: true }],
    });
  });

  // Preview seats keep platform admin. Suppressing it removed the Admin surfaces from
  // preview altogether, so they could not be tested there at all -- see
  // hasEffectivePlatformAdmin in preview-access.server.ts.
  test('platform-admin privilege still resolves inside isolated preview seats', async () => {
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'seed';
    getSession.mockResolvedValue({
      get: (key: string) => (key === 'sessionId' ? 'session-1' : undefined),
    });
    prisma.session.findUnique.mockResolvedValue({ user: { id: 'user-1' } });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

    try {
      await expect(
        requireAdmin(new Request('https://example.com/app/admin'))
      ).resolves.toBeDefined();
    } finally {
      delete process.env.PREVIEW_ACCESS_GATE;
      delete process.env.PREVIEW_DATA_MODE;
    }

    expect(prisma.user.findFirst).toHaveBeenCalled();
  });
});

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
