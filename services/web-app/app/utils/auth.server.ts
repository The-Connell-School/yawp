import { Prisma, type Password, type User } from '@app/prisma';
import { redirect, data } from 'react-router';
import bcrypt from 'bcryptjs';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { prisma } from './db.server.ts';
import { combineHeaders } from './misc.tsx';
import { authSessionStorage } from '../cookie-session-storages/authentication.server.ts';
import { getProfileId, setProfileId } from '~/cookies/profile-id.server';

export const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30;
export const getSessionExpirationDate = () =>
  new Date(Date.now() + SESSION_EXPIRATION_TIME);

export const sessionKey = 'sessionId';

export async function getUserId(request: Request) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    select: { user: { select: { id: true } } },
    where: { id: sessionId, expirationDate: { gt: new Date() } },
  });
  if (!session?.user) {
    throw redirect('/', {
      headers: {
        'set-cookie': await authSessionStorage.destroySession(authSession),
      },
    });
  }
  return session.user.id;
}

export async function requireUserId(
  request: Request,
  { redirectTo }: { redirectTo?: string | null } = {}
) {
  const userId = await getUserId(request);
  if (!userId) {
    const requestUrl = new URL(request.url);
    redirectTo =
      redirectTo === null
        ? null
        : (redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`);
    const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null;
    const loginRedirect = ['/auth/login', loginParams?.toString()]
      .filter(Boolean)
      .join('?');
    throw redirect(loginRedirect);
  }
  return userId;
}

export async function requireProfile(request: Request, userId: string) {
  const profileId = await getProfileId(request);

  if (profileId) {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId, userId },
      select: {
        id: true,
        teacherProfile: true,
        organization: { select: { id: true, name: true } },
      },
    });

    if (!profile) {
      throw redirect('/no-profile', {
        headers: { 'set-cookie': await setProfileId('') },
      });
    }

    return profile;
  } else {
    const profile = await prisma.profile.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        teacherProfile: true,
        organization: { select: { id: true, name: true } },
      },
    });

    if (!profile) {
      throw redirect('/no-profile');
    }

    return profile;
  }
}

export async function requireAdmin(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    select: { id: true },
    where: { id: userId, isAdmin: true },
  });

  if (!user) {
    throw data(
      {
        error: 'Unauthorized',
        requiredRole: 'isAdmin',
        message: `Unauthorized: required role: ${name}`,
      },
      { status: 403 }
    );
  }

  return user;
}

export async function requireOwner(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      profiles: { select: { id: true, isOwner: true } },
    },
    where: { id: userId, profiles: { some: { isOwner: true } } },
  });

  if (!user) {
    throw data(
      {
        error: 'Unauthorized',
        requiredRole: 'owner',
        message: 'Unauthorized: required role: owner',
      },
      { status: 403 }
    );
  }

  return user;
}

export async function requireAnonymous(request: Request) {
  const userId = await getUserId(request);
  if (userId) {
    throw redirect('/');
  }
}

export async function login({
  email,
  password,
}: {
  email: User['email'];
  password: string;
}) {
  const user = await verifyUserPassword({ email }, password);
  if (!user) return null;
  const session = await prisma.session.create({
    select: { id: true, expirationDate: true, userId: true },
    data: {
      expirationDate: getSessionExpirationDate(),
      userId: user.id,
    },
  });
  return session;
}

export async function resetUserPassword({
  email,
  password,
}: {
  email: User['email'];
  password: string;
}) {
  const hashedPassword = await getPasswordHash(password);
  return prisma.user.update({
    where: { email },
    data: {
      password: {
        update: {
          hash: hashedPassword,
        },
      },
    },
  });
}

export async function signup({
  email,
  password,
  name,
  grade,
  period,
  schoolId,
  teacherId,
}: {
  email: User['email'];
  name: User['name'];
  password: string;
  schoolId: string;
  teacherId: string;
  grade: string;
  period: string;
}) {
  const hashedPassword = await getPasswordHash(password);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      password: { create: { hash: hashedPassword } },
      profiles: {
        create: {
          isOwner: false,
          organization: { connect: { id: 'default-org' } },
          // TODO: Add classes
          // studentProfile: {
          //   create: {
          //     class: {
          //       connectOrCreate: {
          //         where: { schoolId_period_grade: { schoolId, period, grade } },
          //         create: {
          //           id: 'default-class',
          //           grade,
          //           period,
          //           school: { connect: { id: schoolId } },
          //           teachers: { connect: { id: teacherId } },
          //         },
          //       },
          //     },
          //   },
          // },
        },
      },
    },
  });

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: { connect: { id: user.id } },
    },
    select: { id: true, expirationDate: true },
  });

  return session;
}

export async function logout(
  {
    request,
    redirectTo = '/',
  }: {
    request: Request;
    redirectTo?: string;
  },
  responseInit?: ResponseInit
) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);
  // if this fails, we still need to delete the session from the user's browser
  // and it doesn't do any harm staying in the db anyway.
  if (sessionId) void prisma.session.deleteMany({ where: { id: sessionId } });
  throw redirect(safeRedirect(redirectTo), {
    ...responseInit,
    headers: combineHeaders(
      { 'set-cookie': await authSessionStorage.destroySession(authSession) },
      responseInit?.headers
    ),
  });
}

export async function getPasswordHash(password: string) {
  const hash = await bcrypt.hash(password, 10);
  return hash;
}

export async function verifyUserPassword(
  where: Pick<User, 'email'> | Pick<User, 'id'>,
  password: Password['hash']
) {
  const userWithPassword = await prisma.user.findUnique({
    where,
    select: { id: true, password: { select: { hash: true } } },
  });

  if (!userWithPassword || !userWithPassword.password) {
    return null;
  }

  const isValid = await bcrypt.compare(
    password,
    userWithPassword.password.hash
  );

  if (!isValid) {
    return null;
  }

  return { id: userWithPassword.id };
}
