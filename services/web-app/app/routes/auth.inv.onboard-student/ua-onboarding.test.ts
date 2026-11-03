import { beforeEach, describe, expect, mock, test } from 'bun:test';

const invitationValues = new Map<string, unknown>();
const invitationSession = {
  get: (key: string) => invitationValues.get(key),
};
const authSession = { set: mock() };
const prisma = {
  class: { findMany: mock(), findFirst: mock() },
  orgMembership: { create: mock() },
  session: { create: mock() },
};
const tx = {
  organization: { findUnique: mock() },
  freeTierApplication: { findFirst: mock() },
  orgMembership: prisma.orgMembership,
  session: prisma.session,
};
const transaction = mock(async (run: (client: typeof tx) => unknown) =>
  run(tx)
);
Object.assign(prisma, { $transaction: transaction });
const isFeatureFlagEnabled = mock();
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled,
}));
const requireAnonymous = mock();
const getPasswordHash = mock();
const redirectWithToast = mock();
const setMembershipId = mock();

mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/auth.server.ts', () => ({
  requireAnonymous,
  getPasswordHash,
  getSessionExpirationDate: () => new Date('2027-01-01T00:00:00Z'),
  sessionKey: 'sessionId',
}));
mock.module('~/cookie-session-storages/invitation.server', () => ({
  invitationCookieStorage: {
    getSession: async () => invitationSession,
    destroySession: async () => 'invitation=; Max-Age=0',
  },
}));
mock.module('~/cookie-session-storages/authentication.server.ts', () => ({
  authSessionStorage: {
    getSession: async () => authSession,
    commitSession: async () => 'auth=session',
  },
}));
mock.module('~/utils/toast.server.ts', () => ({ redirectWithToast }));
mock.module('~/cookies/membership-id.server.ts', () => ({ setMembershipId }));
mock.module('~/utils/ua-partner.server', () => ({
  requireUaOrganizationId: () => 'org-ua',
}));
process.env.UA_STUDENT_BILLING_ENABLED = 'true';
process.env.UA_ORGANIZATION_ID = 'org-ua';
process.env.UA_PARTNER_CODE = 'ROLLTIDE';

const { action, loader } = await import('./route');

beforeEach(() => {
  invitationValues.clear();
  invitationValues.set('email', 'student@ua.edu');
  invitationValues.set('partner', 'ua');
  invitationValues.set('organizationId', 'org-ua');
  for (const model of Object.values(prisma)) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  transaction.mockClear();
  tx.organization.findUnique.mockReset();
  tx.freeTierApplication.findFirst.mockReset();
  isFeatureFlagEnabled.mockReset();
  isFeatureFlagEnabled.mockResolvedValue(false);
  tx.organization.findUnique.mockResolvedValue({ plan: 'FREE_CLASSROOM' });
  tx.freeTierApplication.findFirst.mockResolvedValue({ status: 'SENT' });
  prisma.class.findFirst.mockResolvedValue({
    id: 'class-1',
    school: { organizationId: 'org-free' },
  });
  requireAnonymous.mockReset();
  getPasswordHash.mockReset();
  redirectWithToast.mockReset();
  setMembershipId.mockReset();
  authSession.set.mockReset();

  getPasswordHash.mockResolvedValue('hash');
  prisma.orgMembership.create.mockResolvedValue({
    id: 'member-ua',
    userId: 'user-1',
  });
  prisma.session.create.mockResolvedValue({
    id: 'session-1',
    expirationDate: new Date('2027-01-01T00:00:00Z'),
  });
  setMembershipId.mockResolvedValue('membership-id=member-ua');
  redirectWithToast.mockImplementation(
    async (to: string, _toast: unknown, init?: ResponseInit) =>
      new Response(null, { ...init, status: 302, headers: { location: to } })
  );
});

describe('UA student onboarding', () => {
  test('loads account creation without requiring a class selection', async () => {
    const result = await loader({
      request: new Request('https://yawp.school/auth/inv/onboard-student'),
    } as any);

    expect((result as any).partner).toBe('ua');
    expect((result as any).classes).toEqual([]);
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  test('creates a classless UA student membership and continues to billing', async () => {
    const form = new FormData();
    form.set('name', 'UA Student');
    form.set('password', 'password1234');
    form.set('confirmPassword', 'password1234');

    const response = (await action({
      request: new Request('https://yawp.school/auth/inv/onboard-student', {
        method: 'POST',
        body: form,
      }),
    } as any)) as Response;

    expect(prisma.class.findFirst).not.toHaveBeenCalled();
    expect(prisma.orgMembership.create).toHaveBeenCalledWith({
      data: {
        user: {
          create: {
            email: 'student@ua.edu',
            name: 'UA Student',
            password: { create: { hash: 'hash' } },
          },
        },
        organization: { connect: { id: 'org-ua' } },
        role: 'STUDENT',
      },
    });
    expect(response.headers.get('location')).toBe('/billing/ua');

    const responseInit = redirectWithToast.mock.calls[0]?.[2] as ResponseInit;
    const setCookies = (responseInit.headers as Headers).getSetCookie();
    expect(setCookies).toHaveLength(3);
    expect(setCookies).toEqual([
      'auth=session',
      'invitation=; Max-Age=0',
      'membership-id=member-ua',
    ]);
  });
});

// Exercise the public action with valid legacy invitation cookies. Use the real
// organization approval policy; only persistence and flag resolution are mocked.
function legacyRequest() {
  const form = new FormData();
  form.set('name', 'Legacy Student');
  form.set('classId', 'class-1');
  form.set('password', 'password1234');
  form.set('confirmPassword', 'password1234');
  return {
    request: new Request('https://yawp.school/auth/inv/onboard-student', {
      method: 'POST',
      body: form,
    }),
  } as any;
}
function legacyInvitation(
  kind: 'klassId' | 'klassIds' | 'schoolId' = 'klassId'
) {
  invitationValues.clear();
  invitationValues.set('email', 'legacy@example.test');
  invitationValues.set(
    kind,
    kind === 'klassIds'
      ? ['class-1']
      : kind === 'schoolId'
        ? 'school-1'
        : 'class-1'
  );
}

describe('legacy public student approval admission', () => {
  for (const kind of ['klassId', 'klassIds', 'schoolId'] as const) {
    test(`pending ${kind} invitation denies before any student, roster or session write`, async () => {
      legacyInvitation(kind);
      isFeatureFlagEnabled.mockResolvedValue(true);
      await expect(action(legacyRequest())).rejects.toMatchObject({
        status: 403,
      });
      expect(prisma.orgMembership.create).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
      expect(authSession.set).not.toHaveBeenCalled();
      expect(setMembershipId).not.toHaveBeenCalled();
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(tx.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-free' },
        select: { plan: true },
      });
      expect(tx.freeTierApplication.findFirst.mock.calls[0][0].where).toEqual({
        organizationId: 'org-free',
      });
    });
  }
  for (const mode of [
    'approved',
    'flag-off',
    'paid',
    'foreign-target',
  ] as const) {
    test(`${mode} preserves legacy student onboarding`, async () => {
      legacyInvitation();
      isFeatureFlagEnabled.mockImplementation(
        async (_key: string, orgId: string) =>
          mode !== 'flag-off' &&
          (mode !== 'foreign-target' || orgId === 'another-org')
      );
      tx.freeTierApplication.findFirst.mockResolvedValue({
        status: mode === 'approved' ? 'APPROVED' : 'SENT',
      });
      if (mode === 'paid')
        tx.organization.findUnique.mockResolvedValue({ plan: 'SCHOOL' });
      const response = (await action(legacyRequest())) as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/app');
      expect(prisma.orgMembership.create).toHaveBeenCalledTimes(1);
      expect(
        prisma.orgMembership.create.mock.calls[0][0].data.classesAsStudent
      ).toEqual({ connect: { id: 'class-1' } });
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(isFeatureFlagEnabled).toHaveBeenCalledWith(
        'free-tier',
        'org-free'
      );
    });
  }
});
