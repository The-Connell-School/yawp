import { redirect, type ActionFunctionArgs } from 'react-router';
import {
  getSessionExpirationDate,
  sessionKey,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';
import {
  LOCAL_DEV_PERSONA_EMAILS,
  LOCAL_DEV_PERSONAS,
} from '../../../../../packages/prisma/scripts/local-dev/dev-personas';

function forbidden() {
  return Response.json({ error: 'Dev login is disabled.' }, { status: 403 });
}

export async function action({ request }: ActionFunctionArgs) {
  if (!isLocalDevAuthEnabled()) {
    return forbidden();
  }

  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const redirectTo = String(formData.get('redirectTo') ?? '/app');

  if (!LOCAL_DEV_PERSONA_EMAILS.includes(email)) {
    return Response.json({ error: 'Unknown dev persona.' }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      memberships: {
        select: { id: true, role: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });

  if (!user) {
    return Response.json(
      {
        error: 'Dev persona missing. Run `bun db:seed-local-dev` first.',
      },
      { status: 404 }
    );
  }

  const session = await prisma.session.create({
    select: { id: true, expirationDate: true, userId: true },
    data: {
      expirationDate: getSessionExpirationDate(),
      userId: user.id,
    },
  });

  const membershipId = user.memberships[0]?.id ?? '';
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  authSession.set(sessionKey, session.id);
  authSession.unset('impersonationMode');
  authSession.unset('impersonatorUserId');

  return redirect(redirectTo.startsWith('/') ? redirectTo : '/app', {
    headers: {
      'set-cookie': [
        await authSessionStorage.commitSession(authSession, {
          expires: session.expirationDate,
        }),
        await setMembershipId(membershipId),
      ].join(';'),
    },
  });
}

export function getLocalDevLoginOptions() {
  return LOCAL_DEV_PERSONAS.map((persona) => ({
    email: persona.email,
    label: persona.label,
    description: persona.description,
    role: persona.key,
  }));
}
