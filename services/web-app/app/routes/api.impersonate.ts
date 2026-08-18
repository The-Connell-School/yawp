import { redirect, type ActionFunctionArgs } from 'react-router';
import {
  getSessionExpirationDate,
  getUserId,
  impersonationModeKey,
  impersonatorUserIdKey,
  readOnlyImpersonationMode,
  requireMutableRequest,
  sessionKey,
} from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server.js';
import { setMembershipId } from '~/cookies/membership-id.server';

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status });
}

export type ImpersonateActionDependencies = {
  prismaClient: Pick<typeof prisma, 'user' | 'session' | 'orgMembership'>;
  sessionStorage: Pick<
    typeof authSessionStorage,
    'getSession' | 'commitSession'
  >;
  membershipCookie: typeof setMembershipId;
  mutableRequest: typeof requireMutableRequest;
  userIdForRequest: typeof getUserId;
  sessionExpiration: typeof getSessionExpirationDate;
  keys: {
    session: string;
    impersonationMode: string;
    impersonatorUserId: string;
    readOnlyMode: string;
  };
};

const productionDependencies: ImpersonateActionDependencies = {
  prismaClient: prisma,
  sessionStorage: authSessionStorage,
  membershipCookie: setMembershipId,
  mutableRequest: requireMutableRequest,
  userIdForRequest: getUserId,
  sessionExpiration: getSessionExpirationDate,
  keys: {
    session: sessionKey,
    impersonationMode: impersonationModeKey,
    impersonatorUserId: impersonatorUserIdKey,
    readOnlyMode: readOnlyImpersonationMode,
  },
};

export function createImpersonateAction(
  dependencies: ImpersonateActionDependencies
) {
  return async function impersonateAction({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    const userIdOrEmail = formData.get('userIdOrEmail');
    const secretToken = formData.get('secretToken');

    if (typeof userIdOrEmail !== 'string' || typeof secretToken !== 'string') {
      return errorResponse('Invalid input', 400);
    }

    if (secretToken !== process.env.INTERNAL_COMMAND_TOKEN) {
      return errorResponse('Invalid secret token', 401);
    }

    await dependencies.mutableRequest(request);

    const actorUserId = await dependencies.userIdForRequest(request);
    if (!actorUserId) {
      return errorResponse('Authentication required', 401);
    }

    const superAdmin = await dependencies.prismaClient.user.findFirst({
      where: { id: actorUserId, isSuperAdmin: true },
      select: { id: true },
    });

    if (!superAdmin) {
      return errorResponse('Super admin required', 403);
    }

    try {
      const user = await dependencies.prismaClient.user.findFirstOrThrow({
        where: {
          OR: [{ id: userIdOrEmail }, { email: userIdOrEmail.toLowerCase() }],
        },
      });

      if (!user) {
        return errorResponse('User not found', 404);
      }

      const session = await dependencies.prismaClient.session.create({
        select: { id: true, expirationDate: true, userId: true },
        data: {
          expirationDate: dependencies.sessionExpiration(),
          userId: user.id,
        },
      });

      const membership =
        await dependencies.prismaClient.orgMembership.findFirst({
          where: { userId: user.id },
          select: { id: true },
        });

      const authSession = await dependencies.sessionStorage.getSession(
        request.headers.get('cookie')
      );
      authSession.set(dependencies.keys.session, session.id);
      authSession.set(
        dependencies.keys.impersonationMode,
        dependencies.keys.readOnlyMode
      );
      authSession.set(dependencies.keys.impersonatorUserId, actorUserId);

      return redirect('/app', {
        headers: {
          'set-cookie': [
            await dependencies.sessionStorage.commitSession(authSession, {
              expires: session.expirationDate,
            }),
            await dependencies.membershipCookie(membership?.id ?? ''),
          ].join(';'),
        },
      });
    } catch (error) {
      return errorResponse('Authentication failed', 401);
    }
  };
}

export const action = createImpersonateAction(productionDependencies);
