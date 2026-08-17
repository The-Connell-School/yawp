import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findFirst: mock(), findMany: mock(), findUnique: mock() },
  session: { create: mock(), deleteMany: mock() },
};

const getSessionExpirationDate = mock();
const authSessionStorage = {
  getSession: mock(),
  commitSession: mock(),
};
const setMembershipId = mock();
const isLocalDevAuthEnabled = mock();
const isPreviewAccessGateEnabled = mock();
const getPreviewAccessSeat = mock();
const allSanitizedUsersEnabled = mock();
const redirectResponse = mock(
  (headers: Headers) =>
    new Response(null, { status: 302, headers: { Location: '/app' } })
);

const {
  createDevLoginAction,
  createDevLoginOptionsLoader,
  getLocalDevLoginOptionsPage,
} = await import('./dev-login.server');
const action = createDevLoginAction({
  prismaClient: prisma as never,
  getExpirationDate: getSessionExpirationDate as never,
  sessionKey: 'sessionId',
  sessionStorage: authSessionStorage as never,
  membershipCookie: setMembershipId as never,
  localDevAuthEnabled: isLocalDevAuthEnabled as never,
  previewGateEnabled: isPreviewAccessGateEnabled as never,
  previewSeatForRequest: getPreviewAccessSeat as never,
  allSanitizedUsersEnabled: allSanitizedUsersEnabled as never,
  redirectResponse,
});
const optionsLoader = createDevLoginOptionsLoader({
  prismaClient: prisma as never,
  localDevAuthEnabled: isLocalDevAuthEnabled as never,
  previewGateEnabled: isPreviewAccessGateEnabled as never,
  previewSeatForRequest: getPreviewAccessSeat as never,
  allSanitizedUsersEnabled: allSanitizedUsersEnabled as never,
});

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

function loaderArgs(request: Request) {
  return {
    request,
    params: {},
    url: new URL(request.url),
    pattern: '/auth/dev-login/options',
    context: {},
  };
}

describe('auth.dev-login action', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.user.findFirst.mockReset();
    prisma.user.findMany.mockReset();
    prisma.session.create.mockReset();
    prisma.session.deleteMany.mockReset();
    getSessionExpirationDate.mockReset();
    authSessionStorage.getSession.mockReset();
    authSessionStorage.commitSession.mockReset();
    setMembershipId.mockReset();
    isLocalDevAuthEnabled.mockReset();
    isPreviewAccessGateEnabled.mockReset();
    getPreviewAccessSeat.mockReset();
    allSanitizedUsersEnabled.mockReset();
    redirectResponse.mockClear();

    isLocalDevAuthEnabled.mockReturnValue(true);
    isPreviewAccessGateEnabled.mockReturnValue(false);
    getPreviewAccessSeat.mockResolvedValue(null);
    allSanitizedUsersEnabled.mockReturnValue(false);
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
    const setCookie = redirectResponse.mock.calls[0]?.[0].get('set-cookie');
    expect(setCookie).toContain('en_session=new-session; Path=/; HttpOnly');
    expect(setCookie).toContain('membership-id=mem-1; Path=/; HttpOnly');
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

  test('binds preview dev-login to the organization in the access cookie', async () => {
    isPreviewAccessGateEnabled.mockReturnValue(true);
    getPreviewAccessSeat.mockResolvedValue({
      organizationId: 'preview-seat-2',
      label: 'Bryant Brock',
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'seat-2-user',
      memberships: [{ id: 'seat-2-membership', role: 'STUDENT' }],
    });

    const response = await action(
      actionArgs(makeRequest('student@seat-two.example', 'preview=seat-2'))
    );

    expect(response.status).toBe(302);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'student@seat-two.example',
        memberships: { some: { organizationId: 'preview-seat-2' } },
      },
      select: {
        id: true,
        memberships: {
          where: { organizationId: 'preview-seat-2' },
          select: { id: true, role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('rejects a valid user from a different preview seat', async () => {
    isPreviewAccessGateEnabled.mockReturnValue(true);
    getPreviewAccessSeat.mockResolvedValue({
      organizationId: 'preview-seat-2',
      label: 'Bryant Brock',
    });
    prisma.user.findFirst.mockResolvedValue(null);

    const response = await action(
      actionArgs(makeRequest('dev.student@yawp.local', 'preview=seat-2'))
    );

    expect(response.status).toBe(404);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test('allows scrubbed users from every organization in sanitized production rehearsal', async () => {
    isPreviewAccessGateEnabled.mockReturnValue(true);
    allSanitizedUsersEnabled.mockReturnValue(true);
    getPreviewAccessSeat.mockResolvedValue({
      organizationId: 'default-org',
      label: 'Production rehearsal',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'returning-teacher',
      memberships: [{ id: 'returning-membership', role: 'TEACHER' }],
    });

    const response = await action(
      actionArgs(makeRequest('teacher@another-org.example', 'preview=master'))
    );

    expect(response.status).toBe(302);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'teacher@another-org.example' },
      select: {
        id: true,
        memberships: {
          select: { id: true, role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  test('lists only users belonging to the current preview seat', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        email: 'teacher@seat-two.example',
        name: 'Seat Two Teacher',
        isAdmin: false,
        memberships: [{ role: 'TEACHER', isOrgOwner: false }],
      },
      {
        email: 'student@seat-two.example',
        name: 'Seat Two Student',
        isAdmin: false,
        memberships: [{ role: 'STUDENT', isOrgOwner: false }],
      },
    ]);

    const page = await getLocalDevLoginOptionsPage(
      'preview-seat-2',
      prisma as never
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { memberships: { some: { organizationId: 'preview-seat-2' } } },
      select: {
        email: true,
        name: true,
        isAdmin: true,
        memberships: {
          where: { organizationId: 'preview-seat-2' },
          select: { role: true, isOrgOwner: true },
          take: 1,
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(page.options.map((option) => option.email)).toEqual([
      'teacher@seat-two.example',
      'student@seat-two.example',
    ]);
    expect(page.options.map((option) => option.role)).toEqual([
      'teacher',
      'student',
    ]);
  });

  test('lists scrubbed users from every organization in production rehearsal', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        email: 'teacher@another-org.example',
        name: 'Teacher 0010',
        isAdmin: false,
        memberships: [{ role: 'TEACHER', isOrgOwner: false }],
      },
    ]);

    const page = await getLocalDevLoginOptionsPage(
      'default-org',
      prisma as never,
      { includeAllOrganizations: true }
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { memberships: { some: {} } },
      select: {
        email: true,
        name: true,
        isAdmin: true,
        memberships: {
          select: { role: true, isOrgOwner: true },
          take: 1,
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(page.options.map((option) => option.email)).toEqual([
      'teacher@another-org.example',
    ]);
  });
});

describe('auth.dev-login options pagination', () => {
  beforeEach(() => {
    prisma.user.findMany.mockReset();
    isLocalDevAuthEnabled.mockReset();
    isPreviewAccessGateEnabled.mockReset();
    getPreviewAccessSeat.mockReset();
    allSanitizedUsersEnabled.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    isPreviewAccessGateEnabled.mockReturnValue(false);
    getPreviewAccessSeat.mockResolvedValue(null);
    allSanitizedUsersEnabled.mockReturnValue(false);
  });

  test('does not expose the user directory when dev login is disabled', async () => {
    isLocalDevAuthEnabled.mockReturnValue(false);

    const response = await optionsLoader(
      loaderArgs(
        new Request('http://localhost/auth/dev-login/options?cursor=0')
      )
    );

    expect(response.status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test('requires a valid preview seat before listing users', async () => {
    isPreviewAccessGateEnabled.mockReturnValue(true);

    const response = await optionsLoader(
      loaderArgs(
        new Request('http://localhost/auth/dev-login/options?cursor=0')
      )
    );

    expect(response.status).toBe(401);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test('returns twenty users and a cursor when another page exists', async () => {
    prisma.user.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        email: `student-${String(index + 1).padStart(2, '0')}@example.test`,
        name: `Student ${String(index + 1).padStart(2, '0')}`,
        isAdmin: false,
        memberships: [{ role: 'STUDENT', isOrgOwner: false }],
      }))
    );

    const page = await getLocalDevLoginOptionsPage(
      'preview-seat-2',
      prisma as never,
      { cursor: 0 }
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { memberships: { some: { organizationId: 'preview-seat-2' } } },
      select: {
        email: true,
        name: true,
        isAdmin: true,
        memberships: {
          where: { organizationId: 'preview-seat-2' },
          select: { role: true, isOrgOwner: true },
          take: 1,
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(page.options).toHaveLength(20);
    expect(page.nextCursor).toBe(20);
  });

  test('returns no cursor for the final partial page', async () => {
    prisma.user.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        email: `student-${index + 21}@example.test`,
        name: `Student ${index + 21}`,
        isAdmin: false,
        memberships: [{ role: 'STUDENT', isOrgOwner: false }],
      }))
    );

    const page = await getLocalDevLoginOptionsPage(
      'preview-seat-2',
      prisma as never,
      { cursor: 20 }
    );

    expect(page.options).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });
});
