import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getSession = mock();
const destroySession = mock();

const prisma = {
  session: {
    findUnique: mock(),
  },
};

mock.module('../cookie-session-storages/authentication.server.ts', () => ({
  authSessionStorage: {
    getSession,
    destroySession,
  },
}));
mock.module('./db.server.ts', () => ({ prisma }));

const auth = await import('./auth.server.ts');

function authSession(values: Record<string, unknown>) {
  return {
    get: mock((key: string) => values[key]),
  };
}

function request(method: string, pathname: string) {
  return new Request(`https://example.com${pathname}`, {
    method,
    headers: { cookie: 'en_session=signed-cookie' },
  });
}

describe('read-only impersonation auth contract', () => {
  beforeEach(() => {
    getSession.mockReset();
    destroySession.mockReset();
    prisma.session.findUnique.mockReset();

    getSession.mockResolvedValue(
      authSession({
        sessionId: 'target-session',
        impersonationMode: 'read-only',
        impersonatorUserId: 'operator-user',
      })
    );
    prisma.session.findUnique.mockResolvedValue({
      user: { id: 'target-user' },
    });
  });

  test('reads read-only impersonation state from the signed auth session', async () => {
    const state = await auth.getImpersonationState(
      request('GET', '/app/my-classes')
    );

    expect(state).toEqual({
      isReadOnly: true,
      impersonatorUserId: 'operator-user',
    });
  });

  test('allows navigation requests during read-only impersonation', async () => {
    const userId = await auth.requireUserId(request('GET', '/app/my-classes'));

    expect(userId).toBe('target-user');
  });

  test('blocks normal mutation requests during read-only impersonation', async () => {
    let thrown: unknown;

    try {
      await auth.requireUserId(request('POST', '/api/user/name'));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(403);
    await expect((thrown as Response).json()).resolves.toEqual({
      error: 'Read-only impersonation active',
      message: 'This session can view the app but cannot make changes.',
    });
  });

  test('allows profile cookie changes during read-only impersonation', async () => {
    const userId = await auth.requireUserId(request('POST', '/api/profile-id'));

    expect(userId).toBe('target-user');
  });
});
