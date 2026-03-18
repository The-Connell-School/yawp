import { type ActionFunctionArgs } from 'react-router';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { logout, sessionKey } from '~/utils/auth.server.ts';
import { prisma } from '~/utils/db.server';
import { recordAuditEvent } from '~/utils/audit.server';

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);
  const session = sessionId
    ? await prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true },
      })
    : null;

  await recordAuditEvent({
    eventType: 'auth.logout',
    userId: session?.userId ?? null,
    sessionId: sessionId ?? null,
    payload: {
      redirectTo: '/auth/login',
    },
  });

  return logout({ request, redirectTo: '/auth/login' });
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
