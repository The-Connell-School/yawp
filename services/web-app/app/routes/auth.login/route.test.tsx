import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAnonymous = mock();
const verifyUserPassword = mock();
const getSessionExpirationDate = mock();
const getSession = mock();
const commitSession = mock();
const captureException = mock();
const getPreviewAccessSeat = mock();
const setMembershipId = mock();

const prisma = {
  orgMembership: {
    findFirst: mock(),
  },
  session: {
    create: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({
  getSessionExpirationDate,
  requireAnonymous,
  sessionKey: 'sessionId',
  verifyUserPassword,
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/cookie-session-storages/authentication.server', () => ({
  authSessionStorage: {
    getSession,
    commitSession,
  },
}));
mock.module('~/services/posthog.server', () => ({
  posthog: {
    captureException,
  },
}));
mock.module('~/utils/preview-access.server', () => ({
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode: () =>
    process.env.PREVIEW_ACCESS_GATE === 'on' &&
    process.env.PREVIEW_DATA_MODE === 'seed',
}));
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));

const { action } = await import('./route');

describe('auth.login', () => {
  beforeEach(() => {
    requireAnonymous.mockReset();
    verifyUserPassword.mockReset();
    getSessionExpirationDate.mockReset();
    getSession.mockReset();
    commitSession.mockReset();
    captureException.mockReset();
    getPreviewAccessSeat.mockReset();
    setMembershipId.mockReset();
    prisma.orgMembership.findFirst.mockReset();
    prisma.session.create.mockReset();

    getSessionExpirationDate.mockReturnValue(new Date('2026-01-01T00:00:00.000Z'));
    verifyUserPassword.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
    });
    prisma.session.create.mockResolvedValue({
      id: 'session-1',
      expirationDate: new Date('2026-01-01T00:00:00.000Z'),
      userId: 'user-1',
    });
    getSession.mockResolvedValue({
      set: mock(),
    });
    commitSession.mockResolvedValue('auth=cookie');
    getPreviewAccessSeat.mockResolvedValue({
      organizationId: 'preview-seat-2',
      label: 'Bryant Brock',
    });
    prisma.orgMembership.findFirst.mockResolvedValue({ id: 'membership-2' });
    setMembershipId.mockResolvedValue('membership-id=membership-2; Path=/');
    delete process.env.PREVIEW_ACCESS_GATE;
    delete process.env.PREVIEW_DATA_MODE;
  });

  test('redirects back to the requested document after login', async () => {
    const form = new FormData();
    form.append('email', 'student@example.com');
    form.append('password', 'password1234');
    form.append('redirectTo', '/app/documents/doc-1?tab=editor');

    const response = (await action({
      request: new Request('https://example.com/auth/login?redirectTo=%2Fapp%2Fdocuments%2Fdoc-1', {
        method: 'POST',
        body: form,
      }),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app/documents/doc-1?tab=editor');
  });

  test('rejects valid credentials for a user outside the access-code seat', async () => {
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'seed';
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    const form = new FormData();
    form.append('email', 'student.seat-3@yawp.local');
    form.append('password', 'yawp-dev');

    const response = await action({
      request: new Request('https://example.com/auth/login', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(response).not.toBeInstanceOf(Response);
    expect(prisma.orgMembership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        organizationId: 'preview-seat-2',
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('binds a successful seeded-preview login to the seat membership', async () => {
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'seed';
    const form = new FormData();
    form.append('email', 'student.seat-2@yawp.local');
    form.append('password', 'yawp-dev');

    const response = (await action({
      request: new Request('https://example.com/auth/login', {
        method: 'POST',
        body: form,
      }),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(setMembershipId).toHaveBeenCalledWith('membership-2');
    expect(commitSession).toHaveBeenCalledTimes(1);
  });

  test('keeps production-dump login backward compatible with real org IDs', async () => {
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'production-dump';
    getPreviewAccessSeat.mockResolvedValue(null);
    const form = new FormData();
    form.append('email', 'real-user@example.com');
    form.append('password', 'password1234');

    const response = (await action({
      request: new Request('https://example.com/auth/login', {
        method: 'POST',
        body: form,
      }),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(prisma.orgMembership.findFirst).not.toHaveBeenCalled();
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
  });
});
