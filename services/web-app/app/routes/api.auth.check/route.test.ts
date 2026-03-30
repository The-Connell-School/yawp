import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getSession = mock();
const prisma = {
  session: {
    findUnique: mock(),
  },
};

mock.module('~/cookie-session-storages/authentication.server', () => ({
  authSessionStorage: {
    getSession,
  },
}));
mock.module('~/utils/auth.server', () => ({
  sessionKey: 'sessionId',
}));
mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

describe('api.auth.check', () => {
  beforeEach(() => {
    getSession.mockReset();
    prisma.session.findUnique.mockReset();
  });

  test('returns invalid when the session is missing', async () => {
    getSession.mockResolvedValue({
      get: mock().mockReturnValue(null),
    });

    const response = (await loader({
      request: new Request('https://example.com/api/auth/check'),
    } as any)) as unknown as { data: { valid: boolean; reason?: string } };

    expect(response.data).toMatchObject({
      valid: false,
      reason: 'no_session',
    });
  });

  test('returns invalid when the session id no longer exists', async () => {
    getSession.mockResolvedValue({
      get: mock().mockReturnValue('session-1'),
    });
    prisma.session.findUnique.mockResolvedValue(null);

    const response = (await loader({
      request: new Request('https://example.com/api/auth/check'),
    } as any)) as unknown as { data: { valid: boolean; reason?: string } };

    expect(response.data).toMatchObject({
      valid: false,
      reason: 'session_not_found',
    });
  });
});
