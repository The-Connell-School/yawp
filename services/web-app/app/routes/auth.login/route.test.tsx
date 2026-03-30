import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAnonymous = mock();
const verifyUserPassword = mock();
const getSessionExpirationDate = mock();
const getSession = mock();
const commitSession = mock();
const captureException = mock();

const prisma = {
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

const { action } = await import('./route');

describe('auth.login', () => {
  beforeEach(() => {
    requireAnonymous.mockReset();
    verifyUserPassword.mockReset();
    getSessionExpirationDate.mockReset();
    getSession.mockReset();
    commitSession.mockReset();
    captureException.mockReset();
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
});
