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

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const userIdOrEmail = formData.get('userIdOrEmail');
  const secretToken = formData.get('secretToken');

  if (typeof userIdOrEmail !== 'string' || typeof secretToken !== 'string') {
    return errorResponse('Invalid input', 400);
  }

  if (secretToken !== process.env.INTERNAL_COMMAND_TOKEN) {
    return errorResponse('Invalid secret token', 401);
  }

  await requireMutableRequest(request);

  const actorUserId = await getUserId(request);
  if (!actorUserId) {
    return errorResponse('Authentication required', 401);
  }

  const superAdmin = await prisma.user.findFirst({
    where: { id: actorUserId, isSuperAdmin: true },
    select: { id: true },
  });

  if (!superAdmin) {
    return errorResponse('Super admin required', 403);
  }

  try {
    const user = await prisma.user.findFirstOrThrow({
      where: {
        OR: [{ id: userIdOrEmail }, { email: userIdOrEmail.toLowerCase() }],
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    const session = await prisma.session.create({
      select: { id: true, expirationDate: true, userId: true },
      data: {
        expirationDate: getSessionExpirationDate(),
        userId: user.id,
      },
    });

    const membership = await prisma.orgMembership.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    const authSession = await authSessionStorage.getSession(
      request.headers.get('cookie')
    );
    authSession.set(sessionKey, session.id);
    authSession.set(impersonationModeKey, readOnlyImpersonationMode);
    authSession.set(impersonatorUserIdKey, actorUserId);

    return redirect('/app', {
      headers: {
        'set-cookie': [
          await authSessionStorage.commitSession(authSession, {
            expires: session.expirationDate,
          }),
          await setMembershipId(membership?.id ?? ''),
        ].join(';'),
      },
    });
  } catch (error) {
    return errorResponse('Authentication failed', 401);
  }
}
