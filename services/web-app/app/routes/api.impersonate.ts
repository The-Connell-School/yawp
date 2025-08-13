import {
  data as dataResponse,
  redirect,
  type ActionFunctionArgs,
} from 'react-router';
import { getSessionExpirationDate, sessionKey } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server.js';
import { setProfileId } from '~/cookies/profile-id.server';

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const userIdOrEmail = formData.get('userIdOrEmail');
  const secretToken = formData.get('secretToken');

  if (typeof userIdOrEmail !== 'string' || typeof secretToken !== 'string') {
    return dataResponse({ error: 'Invalid input' }, { status: 400 });
  }

  if (secretToken !== process.env.INTERNAL_COMMAND_TOKEN) {
    return dataResponse({ error: 'Invalid secret token' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findFirstOrThrow({
      where: {
        OR: [{ id: userIdOrEmail }, { email: userIdOrEmail.toLowerCase() }],
      },
    });

    if (!user) {
      return dataResponse({ error: 'User not found' }, { status: 404 });
    }

    const session = await prisma.session.create({
      select: { id: true, expirationDate: true, userId: true },
      data: {
        expirationDate: getSessionExpirationDate(),
        userId: user.id,
      },
    });

    const profile = await prisma.profile.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    const authSession = await authSessionStorage.getSession(
      request.headers.get('cookie')
    );
    authSession.set(sessionKey, session.id);

    return redirect('/app', {
      headers: {
        'set-cookie': [
          await authSessionStorage.commitSession(authSession, {
            expires: session.expirationDate,
          }),
          await setProfileId(profile?.id ?? ''),
        ].join(';'),
      },
    });
  } catch (error) {
    return dataResponse({ error: 'Authentication failed' }, { status: 401 });
  }
}
