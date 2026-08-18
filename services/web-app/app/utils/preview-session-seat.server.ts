import type { PreviewAccessSeat } from './preview-access.server';

type AuthSession = {
  get(key: string): unknown;
};

type SessionWithMemberships = {
  user: {
    memberships: Array<{ id: string; organizationId: string }>;
  };
} | null;

export type PreviewSeatSessionDependencies = {
  getAuthSession(cookieHeader: string | null): Promise<AuthSession>;
  destroyAuthSession(session: AuthSession): Promise<string>;
  getSelectedMembershipId(request: Request): Promise<string | null>;
  clearSelectedMembership(): Promise<string>;
  findSession(sessionId: string): Promise<SessionWithMemberships>;
  deleteSession(sessionId: string): Promise<void>;
};

export type PreviewSeatSessionGuard = (
  request: Request,
  seat: PreviewAccessSeat,
) => Promise<Response | null>;

function mismatchedSessionResponse(request: Request, cookies: string[]) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);

  const url = new URL(request.url);
  const isReadRequest = request.method === 'GET' || request.method === 'HEAD';
  if (!isReadRequest || url.pathname.startsWith('/api/')) {
    return Response.json(
      {
        error: 'Authenticated session does not belong to this preview seat.',
      },
      { status: 401, headers },
    );
  }

  const returnTo = `${url.pathname}${url.search}`;
  headers.set(
    'Location',
    `/auth/login?${new URLSearchParams({ redirectTo: returnTo })}`,
  );
  return new Response(null, { status: 302, headers });
}

export function createPreviewSeatSessionGuard(
  dependencies: PreviewSeatSessionDependencies,
): PreviewSeatSessionGuard {
  return async (request, seat) => {
    const authSession = await dependencies.getAuthSession(
      request.headers.get('cookie'),
    );
    const rawSessionId = authSession.get('sessionId');
    if (typeof rawSessionId !== 'string' || !rawSessionId) return null;

    const [session, selectedMembershipId] = await Promise.all([
      dependencies.findSession(rawSessionId),
      dependencies.getSelectedMembershipId(request),
    ]);
    const memberships = session?.user.memberships ?? [];
    const seatMembership = memberships.find(
      ({ organizationId }) => organizationId === seat.organizationId,
    );
    const effectiveMembershipBelongsToSeat = selectedMembershipId
      ? selectedMembershipId === seatMembership?.id
      : memberships.length === 1 && seatMembership !== undefined;

    if (effectiveMembershipBelongsToSeat) return null;

    await dependencies.deleteSession(rawSessionId);
    const cookies = await Promise.all([
      dependencies.destroyAuthSession(authSession),
      dependencies.clearSelectedMembership(),
    ]);
    return mismatchedSessionResponse(request, cookies);
  };
}

export const enforcePreviewSeatSession: PreviewSeatSessionGuard = async (
  request,
  seat,
) => {
  const [{ authSessionStorage }, { getMembershipId, setMembershipId }, { prisma }] =
    await Promise.all([
      import('../cookie-session-storages/authentication.server.ts'),
      import('../cookies/membership-id.server.ts'),
      import('./db.server.ts'),
    ]);

  return createPreviewSeatSessionGuard({
    getAuthSession: (cookieHeader) => authSessionStorage.getSession(cookieHeader),
    destroyAuthSession: (session) =>
      authSessionStorage.destroySession(session as never),
    getSelectedMembershipId: getMembershipId,
    clearSelectedMembership: () => setMembershipId(''),
    findSession: (sessionId) =>
      prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          user: {
            select: {
              memberships: {
                where: { isActive: true },
                select: { id: true, organizationId: true },
              },
            },
          },
        },
      }),
    deleteSession: async (sessionId) => {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },
  })(request, seat);
};
