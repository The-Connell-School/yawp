import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findFirst: mock(),
    findFirstOrThrow: mock(),
  },
  session: {
    create: mock(),
  },
  orgMembership: {
    findFirst: mock(),
  },
};

const commitSession = mock();
const getSession = mock();
const setMembershipId = mock();

const { createImpersonateAction } = await import('../api.impersonate');
const requireMutableRequest = mock();
const getUserId = mock();
const getSessionExpirationDate = mock();

const action = createImpersonateAction({
  prismaClient: prisma,
  sessionStorage: { getSession, commitSession },
  membershipCookie: setMembershipId,
  mutableRequest: requireMutableRequest,
  userIdForRequest: getUserId,
  sessionExpiration: getSessionExpirationDate,
  keys: {
    session: 'sessionId',
    impersonationMode: 'impersonationMode',
    impersonatorUserId: 'impersonatorUserId',
    readOnlyMode: 'read-only',
  },
} as never);

function authSession(values: Record<string, unknown>) {
  const sessionValues = { ...values };
  return {
    get: mock((key: string) => sessionValues[key]),
    set: mock((key: string, value: unknown) => {
      sessionValues[key] = value;
    }),
  };
}

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
    prisma.orgMembership.findFirst.mockReset();
    getSession.mockReset();
    commitSession.mockReset();
    setMembershipId.mockReset();
    requireMutableRequest.mockReset();
    getUserId.mockReset();
    getSessionExpirationDate.mockReset();

    requireMutableRequest.mockResolvedValue(undefined);
    getUserId.mockResolvedValue('operator-user');
    getSessionExpirationDate.mockReturnValue(
      new Date('2030-01-01T00:00:00.000Z')
    );
    prisma.user.findFirst.mockResolvedValue({ id: 'operator-user' });
    prisma.user.findFirstOrThrow.mockResolvedValue({ id: 'target-user' });
    prisma.session.create.mockResolvedValue({
      id: 'target-session',
      expirationDate: new Date('2030-01-01T00:00:00.000Z'),
      userId: 'target-user',
    });
    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 'target-membership',
    });
    getSession.mockResolvedValue(
      authSession({ sessionId: 'operator-session' })
    );
    commitSession.mockResolvedValue('en_session=target-session; Path=/');
    setMembershipId.mockResolvedValue(
      'membership-id=target-membership; Path=/'
    );
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

  test('honors read-only impersonation before nesting another impersonation', async () => {
    requireMutableRequest.mockRejectedValue(
      Response.json(
        { error: 'Read-only impersonation active' },
        { status: 403 }
      )
    );

    let thrown: unknown;
    try {
      await action({
        request: impersonationRequest({ cookie: 'en_session=read-only' }),
      } as any);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(403);
    expect(requireMutableRequest).toHaveBeenCalledTimes(1);
    expect(getUserId).not.toHaveBeenCalled();
    expect(prisma.user.findFirstOrThrow).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('allows a super admin with the internal token to start a read-only impersonation session', async () => {
    const authSessionStore = authSession({ sessionId: 'operator-session' });
    getSession.mockResolvedValue(authSessionStore);

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
        expirationDate: expect.any(Date),
        userId: 'target-user',
      },
    });
    expect(authSessionStore.set).toHaveBeenCalledWith(
      'sessionId',
      'target-session'
    );
    expect(authSessionStore.set).toHaveBeenCalledWith(
      'impersonationMode',
      'read-only'
    );
    expect(authSessionStore.set).toHaveBeenCalledWith(
      'impersonatorUserId',
      'operator-user'
    );
    expect(commitSession).toHaveBeenCalledTimes(1);
    expect(setMembershipId).toHaveBeenCalledWith('target-membership');
  });
});
