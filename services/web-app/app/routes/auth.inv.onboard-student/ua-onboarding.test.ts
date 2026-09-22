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

describe('UA student onboarding', () => {
  beforeEach(() => {
    invitationValues.clear();
    invitationValues.set('email', 'student@ua.edu');
    invitationValues.set('partner', 'ua');
    invitationValues.set('organizationId', 'org-ua');
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
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
