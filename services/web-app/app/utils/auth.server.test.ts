import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { OrganizationPlan } from '@app/prisma';
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
    findMany: mock(),
  },
  session: {
    findUnique: mock(),
  },
};

const getMembershipId = mock();
const setMembershipId = mock();
const getSession = mock();
const getUaStudentLicenseAccess = mock();

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
mock.module('~/domain/student-license/student-license.server', () => ({
  getUaStudentLicenseAccess,
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
  getUserId,
  getAuthSessionCookieExpiresAt,
  getSessionExpirationDateForUser,
  HANDLE_ONLY_SESSION_EXPIRATION_TIME,
} = await import('./auth.server.ts');

const membershipFixture = {
  id: 'membership-1',
  role: 'TEACHER' as const,
  isOrgOwner: false,
  isActive: true,
  organization: {
    id: 'org-1',
    name: 'Yawp Org',
    plan: 'SCHOOL' as OrganizationPlan,
    reporterEnabled: false,
    classInsightsEnabled: false,
    writingPracticeEnabled: false,
    submissionActivityEnabled: false,
    revisionFlowEnabled: false,
  },
};

describe('session expiry', () => {
  beforeEach(() => {
    getSession.mockReset();
    prisma.session.findUnique.mockReset();
  });

  test('getUserId rejects expired sessions', async () => {
    getSession.mockResolvedValue({ get: () => 'sess-expired' });
    prisma.session.findUnique.mockResolvedValue({
      expirationDate: new Date('2020-01-01T00:00:00Z'),
      user: { id: 'user-handle', email: null },
    });

    let thrown: unknown;
    try {
      await getUserId(new Request('https://example.com/app'));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
  });

  test('getAuthSessionCookieExpiresAt keeps handle-only expiry fixed', async () => {
    const fixed = new Date('2026-01-02T12:00:00Z');
    prisma.session.findUnique.mockResolvedValue({ expirationDate: fixed });
    const expires = await getAuthSessionCookieExpiresAt({
      sessionId: 'sess-1',
      userEmail: null,
    });
    expect(expires.getTime()).toBe(fixed.getTime());
  });

  test('getAuthSessionCookieExpiresAt rolls email users forward', async () => {
    const expires = await getAuthSessionCookieExpiresAt({
      sessionId: 'sess-1',
      userEmail: 'teacher@example.com',
    });
    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });

  test('getSessionExpirationDateForUser uses 12h for handle-only accounts', () => {
    const before = Date.now();
    const expires = getSessionExpirationDateForUser({ email: null });
    const deltaMs = expires.getTime() - before;
    expect(deltaMs).toBeGreaterThanOrEqual(HANDLE_ONLY_SESSION_EXPIRATION_TIME - 2_000);
    expect(deltaMs).toBeLessThanOrEqual(HANDLE_ONLY_SESSION_EXPIRATION_TIME + 2_000);
  });
});

describe('membership auth helpers', () => {
  beforeEach(() => {
    getMembershipId.mockReset();
    setMembershipId.mockReset();
    getSession.mockReset();
    getSession.mockResolvedValue({ get: () => undefined });
    getUaStudentLicenseAccess.mockReset();
    getUaStudentLicenseAccess.mockResolvedValue('BYPASS');
    prisma.orgMembership.findUnique.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    prisma.orgMembership.findMany.mockReset();
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
      where: { id: 'membership-1', userId: 'user-1', isActive: true },
      select: {
        id: true,
        role: true,
        isOrgOwner: true,
        isActive: true,
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
            reporterEnabled: true,
            classInsightsEnabled: true,
            writingPracticeEnabled: true,
            submissionActivityEnabled: true,
            revisionFlowEnabled: true,
          },
        },
      },
    });
    expect(membership).toEqual(membershipFixture);
  });

  test('requireMembership falls back to first membership when cookie is missing', async () => {
    getMembershipId.mockResolvedValue('');
    prisma.orgMembership.findMany.mockResolvedValue([membershipFixture]);

    const membership = await requireMembership(
      new Request('https://example.com/app'),
      'user-1'
    );

    expect(prisma.orgMembership.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        isOrgOwner: true,
        isActive: true,
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
            reporterEnabled: true,
            classInsightsEnabled: true,
            writingPracticeEnabled: true,
            submissionActivityEnabled: true,
            revisionFlowEnabled: true,
          },
        },
      },
    });
    expect(membership).toEqual(membershipFixture);
  });

  test('requireMembership prefers a non-default-org membership over legacy default-org', async () => {
    getMembershipId.mockResolvedValue('');
    const legacyDefaultOrg = {
      ...membershipFixture,
      id: 'membership-legacy',
      role: 'STUDENT' as const,
      organization: {
        ...membershipFixture.organization,
        id: 'default-org',
        name: 'Yawp!',
      },
    };
    const schoolOrg = {
      ...membershipFixture,
      id: 'membership-school',
      role: 'STUDENT' as const,
      organization: {
        ...membershipFixture.organization,
        id: 'org-gear-up',
        name: 'GEAR UP ASU',
      },
    };
    // Newest first from the query; default-org still present and would win under
    // the old createdAt-asc behavior if it were older.
    prisma.orgMembership.findMany.mockResolvedValue([schoolOrg, legacyDefaultOrg]);

    const membership = await requireMembership(
      new Request('https://example.com/app'),
      'user-1'
    );

    expect(membership).toEqual(schoolOrg);
  });

  test('requireMembership redirects an unpaid UA student to billing', async () => {
    getMembershipId.mockResolvedValue('membership-1');
    prisma.orgMembership.findUnique.mockResolvedValue({
      ...membershipFixture,
      role: 'STUDENT',
      organization: { ...membershipFixture.organization, id: 'org-ua' },
    });
    getUaStudentLicenseAccess.mockResolvedValue('PAYMENT_REQUIRED');

    await expect(
      requireMembership(new Request('https://example.com/app'), 'user-1')
    ).rejects.toMatchObject({ status: 302 });

    expect(getUaStudentLicenseAccess).toHaveBeenCalledWith({
      id: 'membership-1',
      role: 'STUDENT',
      organizationId: 'org-ua',
    });
  });

  test('billing routes can resolve the same unpaid membership without a redirect loop', async () => {
    getMembershipId.mockResolvedValue('membership-1');
    prisma.orgMembership.findUnique.mockResolvedValue({
      ...membershipFixture,
      role: 'STUDENT',
      organization: { ...membershipFixture.organization, id: 'org-ua' },
    });
    getUaStudentLicenseAccess.mockResolvedValue('PAYMENT_REQUIRED');

    const membership = await requireMembership(
      new Request('https://example.com/billing/ua'),
      'user-1',
      { allowPaymentRequired: true }
    );

    expect(membership.id).toBe('membership-1');
    expect(getUaStudentLicenseAccess).not.toHaveBeenCalled();
  });

  test('requireMembership rejects a cookie-selected inactive membership and clears the scope cookie', async () => {
    getMembershipId.mockResolvedValue('inactive-membership');
    prisma.orgMembership.findUnique.mockResolvedValue(null);

    await expect(
      requireMembership(new Request('https://example.com/app'), 'user-1')
    ).rejects.toMatchObject({
      status: 302,
      headers: expect.any(Headers),
    });

    expect(prisma.orgMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'inactive-membership',
          userId: 'user-1',
          isActive: true,
        },
      })
    );
    expect(setMembershipId).toHaveBeenCalledWith('');
  });

  test('requireMembership never falls back to an inactive membership', async () => {
    getMembershipId.mockResolvedValue('');
    prisma.orgMembership.findMany.mockResolvedValue([]);

    await expect(
      requireMembership(new Request('https://example.com/app'), 'user-1')
    ).rejects.toMatchObject({ status: 302 });

    expect(prisma.orgMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', isActive: true } })
    );
  });

  test('requireOwner checks isOrgOwner on the active membership', async () => {
    getSession.mockResolvedValue({
      get: (key: string) => (key === 'sessionId' ? 'session-1' : undefined),
    });
    prisma.session.findUnique.mockResolvedValue({
      expirationDate: new Date('2030-01-01'),
      user: { id: 'user-1', email: 'owner@example.com' },
    });
    prisma.user.findUnique.mockResolvedValue({ mustChangePassword: false });
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
    prisma.session.findUnique.mockResolvedValue({
      expirationDate: new Date('2030-01-01'),
      user: { id: 'user-1', email: 'admin@example.com' },
    });
    prisma.user.findUnique.mockResolvedValue({ mustChangePassword: false });
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
    prisma.session.findUnique.mockResolvedValue({
      expirationDate: new Date('2030-01-01'),
      user: { id: 'user-1', email: 'admin@example.com' },
    });
    prisma.user.findUnique.mockResolvedValue({ mustChangePassword: false });
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
      email: 'teacher.invited@example.com',
      mustChangePassword: false,
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
        email: true,
        mustChangePassword: true,
        password: { select: { hash: true } },
      },
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'teacher.invited@example.com',
      mustChangePassword: false,
    });
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
