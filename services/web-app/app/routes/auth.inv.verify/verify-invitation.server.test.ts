import { beforeEach, describe, expect, mock, test } from 'bun:test';

const verifyTOTP = mock();
const prisma = {
  invitation: {
    findFirst: mock(),
    delete: mock(),
  },
  user: {
    findFirst: mock(),
  },
  orgMembership: {
    update: mock(),
    create: mock(),
  },
};

const invitationCookieStorage = {
  getSession: mock(async () => ({
    set: mock(),
  })),
  commitSession: mock(async () => 'invitation-cookie=1'),
  destroySession: mock(async () => 'invitation-cookie=; Max-Age=0'),
};

mock.module('~/utils/totp.server.ts', () => ({ verifyTOTP }));
mock.module('~/utils/totp.server', () => ({ verifyTOTP }));
mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/cookie-session-storages/invitation.server', () => ({
  invitationCookieStorage,
}));
mock.module('~/cookies/membership-id.server', () => ({
  setMembershipId: mock(async () => 'membership-id=1'),
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: (
    location: string,
    _toast: unknown,
    init?: ResponseInit
  ) =>
    new Response(null, {
      status: 302,
      headers: { location, ...(init?.headers as Record<string, string>) },
    }),
}));

const {
  verifyInvitationCredentials,
  verifyInvitationFromQuery,
} = await import('./verify-invitation.server');

describe('verifyInvitationCredentials', () => {
  beforeEach(() => {
    verifyTOTP.mockReset();
    prisma.invitation.findFirst.mockReset();
    prisma.invitation.delete.mockReset();
    prisma.user.findFirst.mockReset();
    prisma.orgMembership.update.mockReset();
    prisma.orgMembership.create.mockReset();
    invitationCookieStorage.getSession.mockClear();
    invitationCookieStorage.commitSession.mockClear();
  });

  test('rejects invalid TOTP codes instead of treating the promise as success', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'inv-1',
      expiresAt: new Date(Date.now() + 60_000),
      metadata: JSON.stringify({ klassId: 'class-1' }),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 3600,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    verifyTOTP.mockResolvedValue(null);

    const result = await verifyInvitationCredentials({
      type: 'onboard-student',
      target: 'new@example.com',
      code: 'BADBAD',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.code).toBe('Invalid code.');
    }
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
    expect(verifyTOTP).toHaveBeenCalled();
  });

  test('redirects a new student invite to account setup after a valid code', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'inv-1',
      expiresAt: new Date(Date.now() + 60_000),
      metadata: JSON.stringify({ klassId: 'class-1' }),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 3600,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    verifyTOTP.mockResolvedValue({ delta: 0 });
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await verifyInvitationCredentials({
      type: 'onboard-student',
      target: 'new@example.com',
      code: 'GOOD12',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.headers.get('location')).toBe(
        '/auth/inv/onboard-student'
      );
    }
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
  });

  test('sends existing student invitees to sign in without consuming the invitation', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'inv-1',
      expiresAt: new Date(Date.now() + 60_000),
      metadata: JSON.stringify({ klassId: 'class-1' }),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 3600,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    verifyTOTP.mockResolvedValue({ delta: 0 });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

    const result = await verifyInvitationCredentials({
      type: 'onboard-student',
      target: 'existing@example.com',
      code: 'GOOD12',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.headers.get('location')).toContain('/auth/login');
    }
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
  });

  test('prepares a new teacher invite without consuming it', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'inv-teacher',
      expiresAt: new Date(Date.now() + 60_000),
      metadata: JSON.stringify({ organizationId: 'org-1' }),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 3600,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    verifyTOTP.mockResolvedValue({ delta: 0 });
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await verifyInvitationCredentials({
      type: 'onboard-teacher',
      target: 'new-teacher@example.com',
      code: 'GOOD12',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.headers.get('location')).toBe(
        '/auth/inv/onboard-teacher'
      );
    }
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
  });

  test('consumes a teacher invite when an existing user accepts', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'inv-teacher',
      expiresAt: new Date(Date.now() + 60_000),
      metadata: JSON.stringify({ organizationId: 'org-1' }),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 3600,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    verifyTOTP.mockResolvedValue({ delta: 0 });
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      memberships: [],
    });
    prisma.orgMembership.create.mockResolvedValue({
      id: 'member-1',
      userId: 'user-1',
    });

    const result = await verifyInvitationCredentials({
      type: 'onboard-teacher',
      target: 'existing@example.com',
      code: 'GOOD12',
    });

    expect(result.ok).toBe(true);
    expect(prisma.invitation.delete).toHaveBeenCalledWith({
      where: { id: 'inv-teacher' },
    });
  });
});

describe('verifyInvitationFromQuery', () => {
  beforeEach(() => {
    verifyTOTP.mockReset();
    prisma.invitation.findFirst.mockReset();
    prisma.invitation.delete.mockReset();
    prisma.user.findFirst.mockResolvedValue(null);
  });

  test('auto-verifies class invite links opened from email', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'inv-1',
      expiresAt: new Date(Date.now() + 60_000),
      metadata: JSON.stringify({ klassId: 'class-1' }),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 3600,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    verifyTOTP.mockResolvedValue({ delta: 0 });

    const response = await verifyInvitationFromQuery(
      new Request(
        'https://yawp.school/auth/inv/verify?type=onboard-student&target=new%40example.com&code=GOOD12'
      )
    );

    expect(response?.headers.get('location')).toBe('/auth/inv/onboard-student');
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
  });

  test('GET on a teacher invite link can be opened twice before onboarding', async () => {
    prisma.invitation.findFirst.mockResolvedValue({
      id: 'inv-teacher',
      expiresAt: new Date(Date.now() + 60_000),
      metadata: JSON.stringify({ organizationId: 'org-1' }),
      algorithm: 'SHA-256',
      secret: 'secret',
      period: 3600,
      charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
      digits: 6,
    });
    verifyTOTP.mockResolvedValue({ delta: 0 });
    const url =
      'https://yawp.school/auth/inv/verify?type=onboard-teacher&target=teacher%40example.com&code=GOOD12';

    const first = await verifyInvitationFromQuery(new Request(url));
    const second = await verifyInvitationFromQuery(new Request(url));

    expect(first?.headers.get('location')).toBe('/auth/inv/onboard-teacher');
    expect(second?.headers.get('location')).toBe('/auth/inv/onboard-teacher');
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
  });
});
