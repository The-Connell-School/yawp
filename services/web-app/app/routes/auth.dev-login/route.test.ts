import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUnique: mock() },
  session: { create: mock(), deleteMany: mock() },
};

const getSessionExpirationDate = mock();
const authSessionStorage = {
  getSession: mock(),
  commitSession: mock(),
};
const setMembershipId = mock();
const isLocalDevAuthEnabled = mock();

const authServerMock = () => ({
  getSessionExpirationDate,
  sessionKey: 'sessionId',
});
const authSessionStorageMock = () => ({
  authSessionStorage,
});
const localDevAuthMock = () => ({
  isLocalDevAuthEnabled,
});

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.ts', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', authServerMock);
mock.module('~/utils/auth.server.ts', authServerMock);
mock.module('~/utils/auth.server.js', authServerMock);
mock.module(
  '~/cookie-session-storages/authentication.server',
  authSessionStorageMock
);
mock.module(
  '~/cookie-session-storages/authentication.server.ts',
  authSessionStorageMock
);
mock.module(
  '~/cookie-session-storages/authentication.server.js',
  authSessionStorageMock
);
mock.module('~/cookies/membership-id.server', () => ({ setMembershipId }));
mock.module('~/cookies/membership-id.server.ts', () => ({ setMembershipId }));
mock.module('~/cookies/membership-id.server.js', () => ({ setMembershipId }));
mock.module('~/utils/local-dev-auth.server', localDevAuthMock);
mock.module('~/utils/local-dev-auth.server.ts', localDevAuthMock);
mock.module('~/utils/local-dev-auth.server.js', localDevAuthMock);

const { action } = await import('./route');

function makeRequest(email: string, cookie?: string) {
  const body = new FormData();
  body.set('email', email);
  body.set('redirectTo', '/app/documents/abc');
  return new Request('http://localhost/auth/dev-login', {
    method: 'POST',
    body,
    headers: cookie ? { cookie } : undefined,
  });
}

function actionArgs(request: Request) {
  return {
    request,
    params: {},
    url: new URL(request.url),
    pattern: '/auth/dev-login',
    context: {},
  };
}

describe('auth.dev-login action', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.session.create.mockReset();
    prisma.session.deleteMany.mockReset();
    getSessionExpirationDate.mockReset();
    authSessionStorage.getSession.mockReset();
    authSessionStorage.commitSession.mockReset();
    setMembershipId.mockReset();
    isLocalDevAuthEnabled.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    getSessionExpirationDate.mockReturnValue(
      new Date('2030-01-01T00:00:00.000Z')
    );
    authSessionStorage.getSession.mockResolvedValue({
      get: () => 'old-session-id',
      set: mock(),
      unset: mock(),
    });
    authSessionStorage.commitSession.mockResolvedValue(
      'en_session=new-session; Path=/; HttpOnly'
    );
    setMembershipId.mockResolvedValue('membership-id=mem-1; Path=/; HttpOnly');
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      memberships: [{ id: 'mem-1', role: 'STUDENT' }],
    });
    prisma.session.create.mockResolvedValue({
      id: 'new-session',
      expirationDate: new Date('2030-01-01T00:00:00.000Z'),
      userId: 'user-1',
    });
  });

  test('sets auth and membership cookies as separate headers', async () => {
    const response = await action(
      actionArgs(makeRequest('dev.student@yawp.local', 'en_session=old'))
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
    expect(response.headers.getSetCookie()).toEqual([
      'en_session=new-session; Path=/; HttpOnly',
      'membership-id=mem-1; Path=/; HttpOnly',
    ]);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: 'old-session-id' },
    });
  });

  test('rejects unknown personas', async () => {
    const response = await action(
      actionArgs(makeRequest('not-a-persona@yawp.local'))
    );

    expect(response.status).toBe(404);
  });
});
