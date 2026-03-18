import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getSession = mock();
const recordAuditEvent = mock();
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
mock.module('~/utils/audit.server', () => ({
  recordAuditEvent,
}));

const { loader } = await import('./route');

describe('api.auth.check', () => {
  beforeEach(() => {
    getSession.mockReset();
    recordAuditEvent.mockReset();
    prisma.session.findUnique.mockReset();
  });

  test('records an auth audit event when the session is missing', async () => {
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
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: 'auth.session.invalid',
      payload: {
        reason: 'no_session',
      },
    });
  });

  test('records an auth audit event when the session id no longer exists', async () => {
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
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: 'auth.session.invalid',
      payload: {
        reason: 'session_not_found',
        sessionId: 'session-1',
      },
    });
  });
});
