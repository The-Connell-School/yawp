import { setMembershipId } from '~/cookies/membership-id.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { getSessionExpirationDate } from '~/utils/auth.server';
import { combineHeaders } from '~/utils/misc';
import { prisma } from '~/utils/db.server';

const sessionKey = 'sessionId';

export async function createDevPanelSessionHeaders(
  userId: string,
  membershipId: string,
  request: Request
) {
  const session = await prisma.session.create({
    select: { id: true, expirationDate: true },
    data: {
      userId,
      expirationDate: getSessionExpirationDate(),
    },
  });
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const previousSessionId = authSession.get(sessionKey);
  if (previousSessionId) {
    void prisma.session.deleteMany({ where: { id: previousSessionId } });
  }
  authSession.set(sessionKey, session.id);
  authSession.unset('impersonationMode');
  authSession.unset('impersonatorUserId');
  return combineHeaders(
    {
      'set-cookie': await authSessionStorage.commitSession(authSession, {
        expires: session.expirationDate,
      }),
    },
    { 'set-cookie': await setMembershipId(membershipId) }
  );
}
