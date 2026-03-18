import { type LoaderFunctionArgs, data } from 'react-router';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { sessionKey } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { recordAuditEvent } from '~/utils/audit.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);

  if (!sessionId) {
    await recordAuditEvent({
      eventType: 'auth.session.invalid',
      payload: {
        reason: 'no_session',
      },
    });
    return data({ valid: false, reason: 'no_session' });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });

  if (!session) {
    await recordAuditEvent({
      eventType: 'auth.session.invalid',
      payload: {
        reason: 'session_not_found',
        sessionId,
      },
    });
    return data({ valid: false, reason: 'session_not_found' });
  }

  return data({ valid: true });
}
