import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findFirst: mock(),
    findFirstOrThrow: mock(),
  },
  session: {
    create: mock(),
  },
  profile: {
    findFirst: mock(),
  },
};

const getUserId = mock();
const commitSession = mock();
const getSession = mock();
const setProfileId = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  getSessionExpirationDate: () => new Date('2030-01-01T00:00:00.000Z'),
  getUserId,
  sessionKey: 'sessionId',
}));
mock.module('~/cookie-session-storages/authentication.server.js', () => ({
  authSessionStorage: {
    getSession,
    commitSession,
  },
}));
mock.module('~/cookies/profile-id.server', () => ({
  setProfileId,
}));

const { action } = await import('../api.impersonate');

function impersonationRequest({
  userIdOrEmail = 'teacher@example.com',
  secretToken = 'dev-token',
  cookie,
}: {
  userIdOrEmail?: string;
  secretToken?: string;
  cookie?: string;
} = {}) {
  const body = new FormData();
  body.set('userIdOrEmail', userIdOrEmail);
  body.set('secretToken', secretToken);

  return new Request('https://example.com/api/impersonate', {
    method: 'POST',
    body,
    headers: cookie ? { cookie } : undefined,
  });
}

describe('api.impersonate', () => {
  beforeEach(() => {
    process.env.INTERNAL_COMMAND_TOKEN = 'dev-token';

    prisma.user.findFirst.mockReset();
    prisma.user.findFirstOrThrow.mockReset();
    prisma.session.create.mockReset();
    prisma.profile.findFirst.mockReset();
    getUserId.mockReset();
    getSession.mockReset();
    commitSession.mockReset();
    setProfileId.mockReset();

    getUserId.mockResolvedValue('operator-user');
    prisma.user.findFirst.mockResolvedValue({ id: 'operator-user' });
    prisma.user.findFirstOrThrow.mockResolvedValue({ id: 'target-user' });
    prisma.session.create.mockResolvedValue({
      id: 'target-session',
      expirationDate: new Date('2030-01-01T00:00:00.000Z'),
      userId: 'target-user',
    });
    prisma.profile.findFirst.mockResolvedValue({ id: 'target-profile' });
    getSession.mockResolvedValue({
      set: mock(),
    });
    commitSession.mockResolvedValue('en_session=target-session; Path=/');
    setProfileId.mockResolvedValue('profile-id=target-profile; Path=/');
  });

  test('rejects a valid token when the request is not authenticated', async () => {
    getUserId.mockResolvedValue(null);

    const response = (await action({
      request: impersonationRequest(),
    } as any)) as Response;

    expect(response.status).toBe(401);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('rejects an ordinary admin who is not a super admin', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: impersonationRequest({ cookie: 'en_session=admin' }),
    } as any)) as Response;

    expect(response.status).toBe(403);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'operator-user', isSuperAdmin: true },
      select: { id: true },
    });
    expect(prisma.user.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('rejects an invalid internal token before creating a session', async () => {
    const response = (await action({
      request: impersonationRequest({
        cookie: 'en_session=super-admin',
        secretToken: 'wrong-token',
      }),
    } as any)) as Response;

    expect(response.status).toBe(401);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('allows a super admin with the internal token to impersonate any user', async () => {
    const authSession = { set: mock() };
    getSession.mockResolvedValue(authSession);

    const response = (await action({
      request: impersonationRequest({
        cookie: 'en_session=super-admin',
        userIdOrEmail: 'Teacher@Example.COM',
      }),
    } as any)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'operator-user', isSuperAdmin: true },
      select: { id: true },
    });
    expect(prisma.user.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'Teacher@Example.COM' }, { email: 'teacher@example.com' }],
      },
    });
    expect(prisma.session.create).toHaveBeenCalledWith({
      select: { id: true, expirationDate: true, userId: true },
      data: {
        expirationDate: new Date('2030-01-01T00:00:00.000Z'),
        userId: 'target-user',
      },
    });
    expect(authSession.set).toHaveBeenCalledWith('sessionId', 'target-session');
    expect(commitSession).toHaveBeenCalledTimes(1);
    expect(setProfileId).toHaveBeenCalledWith('target-profile');
  });
});
