import { type LoaderFunctionArgs, data } from 'react-router';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { sessionKey } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);

  if (!sessionId) {
    return data({ valid: false, reason: 'no_session' });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { expirationDate: true },
  });

  if (!session) {
    return data({ valid: false, reason: 'session_not_found' });
  }

  if (session.expirationDate < new Date()) {
    return data({ valid: false, reason: 'session_expired' });
  }

  return data({ valid: true });
}
