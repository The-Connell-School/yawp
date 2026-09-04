import { beforeEach, describe, expect, mock, test } from 'bun:test';

const invitationSession = { set: mock() };
const prisma = {
  invitation: { findFirst: mock(), delete: mock() },
  user: { findFirst: mock() },
  orgMembership: { create: mock(), update: mock() },
};
const verifyTOTP = mock();
const redirectWithToast = mock();
const setMembershipId = mock();
const invitationCookieStorage = {
  getSession: mock(),
  commitSession: mock(),
  destroySession: mock(),
};

mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/totp.server.ts', () => ({ verifyTOTP }));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));
mock.module('~/cookie-session-storages/invitation.server', () => ({
  invitationCookieStorage,
}));

const { action } = await import('./route');

function verifyRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('https://yawp.school/auth/inv/verify', {
    method: 'POST',
    body: form,
  });
}

describe('teacher invite verification', () => {
  beforeEach(() => {
    prisma.invitation.findFirst.mockReset();
    prisma.invitation.delete.mockReset();
    prisma.user.findFirst.mockReset();
    prisma.orgMembership.create.mockReset();
    prisma.orgMembership.update.mockReset();
    verifyTOTP.mockReset();
    redirectWithToast.mockReset();
    setMembershipId.mockReset();
    invitationCookieStorage.getSession.mockReset();
    invitationCookieStorage.commitSession.mockReset();
    invitationCookieStorage.destroySession.mockReset();
    invitationSession.set.mockReset();

    verifyTOTP.mockReturnValue(true);
    prisma.invitation.delete.mockResolvedValue({});
    invitationCookieStorage.getSession.mockResolvedValue(invitationSession);
    invitationCookieStorage.commitSession.mockResolvedValue('invitation=abc');
    invitationCookieStorage.destroySession.mockResolvedValue(
      'invitation=; Max-Age=0'
    );
    setMembershipId.mockResolvedValue('membership=member-1');
    redirectWithToast.mockImplementation(
      async (to: string, _toast: unknown, init?: ResponseInit) =>
        new Response(null, {
          ...init,
          status: 302,
          headers: { location: to, ...(init?.headers as HeadersInit) },
        })
    );
  });

  test('existing teacher memberships without a school go to school selection', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'invite-1',
      expiresAt: new Date(Date.now() + 60_000),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 600,
      charSet: 'ABC',
      metadata: JSON.stringify({ organizationId: 'org-ua' }),
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [{ id: 'member-1', role: 'TEACHER', schools: [] }],
    });

    const response = (await action({
      request: verifyRequest({
        code: 'ABC123',
        type: 'onboard-teacher',
        target: 'teacher@yawp.test',
      }),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      '/auth/inv/onboard-teacher-school'
    );
    expect(invitationSession.set).toHaveBeenCalledWith(
      'organizationId',
      'org-ua'
    );
    expect(invitationSession.set).toHaveBeenCalledWith(
      'email',
      'teacher@yawp.test'
    );
    expect(setMembershipId).not.toHaveBeenCalled();
  });
});
