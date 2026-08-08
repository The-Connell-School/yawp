import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { matchesOwnerWhere } from './testing/where-eval.ts';

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
    writingPracticeEnabled: false,
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
            writingPracticeEnabled: true,
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
            writingPracticeEnabled: true,
          },
        },
      },
    });
    expect(membership).toEqual(membershipFixture);
  });

  test('requireOwner checks isOrgOwner on the active membership', async () => {
    getSession.mockResolvedValue({
      get: (key: string) => (key === 'sessionId' ? 'session-1' : undefined),
    });
    prisma.session.findUnique.mockResolvedValue({
      user: { id: 'user-1' },
    });
    getMembershipId.mockResolvedValue('membership-1');
    prisma.orgMembership.findUnique.mockResolvedValue({
      ...membershipFixture,
      isOrgOwner: true,
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
        memberships: { some: { id: 'membership-1', isOrgOwner: true } },
      },
    });
    expect(user).toEqual({
      id: 'user-1',
      memberships: [{ id: 'membership-1', isOrgOwner: true }],
    });
  });

  // N5 -- requireOwner asked whether the user owned *an* organization, while the request
  // was scoped to the organization of the cookie-selected membership. These two tests run
  // the clause requireOwner builds against a fixture user through matchesOwnerWhere, so a
  // clause that only proves ownership somewhere really does admit the caller.
  const twoOrgUser = {
    id: 'user-1',
    memberships: [
      { id: 'membership-a', organizationId: 'org-a', isOrgOwner: true },
      { id: 'membership-b', organizationId: 'org-b', isOrgOwner: false },
    ],
  };

  const arrangeTwoOrgUser = (activeMembershipId: string) => {
    getSession.mockResolvedValue({
      get: (key: string) => (key === 'sessionId' ? 'session-1' : undefined),
    });
    prisma.session.findUnique.mockResolvedValue({ user: { id: 'user-1' } });
    getMembershipId.mockResolvedValue(activeMembershipId);

    const active = twoOrgUser.memberships.find(
      (membership) => membership.id === activeMembershipId
    )!;
    prisma.orgMembership.findUnique.mockResolvedValue({
      id: active.id,
      role: 'TEACHER' as const,
      isOrgOwner: active.isOrgOwner,
      organization: {
        id: active.organizationId,
        name: active.organizationId,
        reporterEnabled: false,
        classInsightsEnabled: false,
        writingPracticeEnabled: false,
      },
    });

    prisma.user.findFirst.mockImplementation(async ({ where }: any) =>
      matchesOwnerWhere(where, twoOrgUser) ? twoOrgUser : null
    );
  };

  const ownerRequest = () =>
    new Request('https://example.com/app/organization/students', {
      method: 'GET',
      headers: { cookie: 'en_session=signed-cookie' },
    });

  test('requireOwner admits an owner whose active membership is the owned organization', async () => {
    arrangeTwoOrgUser('membership-a');

    await expect(requireOwner(ownerRequest())).resolves.toMatchObject({
      id: 'user-1',
    });
  });

  test('requireOwner refuses an owner of another organization whose active membership is not an owner membership', async () => {
    arrangeTwoOrgUser('membership-b');

    await expect(requireOwner(ownerRequest())).rejects.toMatchObject({
      init: { status: 403 },
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
        requireAdmin(new Request('https://example.com/app/admin')),
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
