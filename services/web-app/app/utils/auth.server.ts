import {
  type MembershipRole,
  Prisma,
  type Password,
  type User,
} from '@app/prisma';
import { redirect, data } from 'react-router';
import bcrypt from 'bcryptjs';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { prisma } from './db.server.ts';
import { combineHeaders } from './misc.tsx';
import { authSessionStorage } from '../cookie-session-storages/authentication.server.ts';
import {
  getMembershipId,
  setMembershipId,
} from '~/cookies/membership-id.server';
import { normalizeEmail } from './normalize-email';

const membershipSelect = {
  id: true,
  role: true,
  isOrgOwner: true,
  organization: {
    select: {
      id: true,
      name: true,
      reporterEnabled: true,
      classInsightsEnabled: true,
      lessonPlannerEnabled: true,
    },
  },
} as const;

export type RequiredMembership = Prisma.OrgMembershipGetPayload<{
  select: typeof membershipSelect;
}>;

export function isTeacherMembership(membership: { role: MembershipRole }) {
  return membership.role === 'TEACHER';
}

export function isStudentMembership(membership: { role: MembershipRole }) {
  return membership.role === 'STUDENT';
}

export const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 365 * 100;
export const getSessionExpirationDate = () =>
  new Date(Date.now() + SESSION_EXPIRATION_TIME);

export const sessionKey = 'sessionId';
export const impersonationModeKey = 'impersonationMode';
export const impersonatorUserIdKey = 'impersonatorUserId';
export const readOnlyImpersonationMode = 'read-only';

const mutationSafeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const readOnlySessionAllowedMutationPaths = new Set([
  '/auth/logout',
  '/api/preferences/nav',
  '/api/preferences/contrast',
  '/api/preferences/submitted-papers-filter',
  '/api/membership-id',
  '/api/student-preview',
]);

function isMutationRequest(request: Request) {
  return !mutationSafeMethods.has(request.method.toUpperCase());
}

function isAllowedReadOnlySessionMutation(request: Request) {
  return readOnlySessionAllowedMutationPaths.has(
    new URL(request.url).pathname
  );
}

export async function getImpersonationState(request: Request) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const impersonatorUserId = authSession.get(impersonatorUserIdKey);

  return {
    isReadOnly:
      authSession.get(impersonationModeKey) === readOnlyImpersonationMode,
    impersonatorUserId:
      typeof impersonatorUserId === 'string' ? impersonatorUserId : null,
  };
}

export async function requireMutableRequest(request: Request) {
  if (!isMutationRequest(request)) return;
  if (isAllowedReadOnlySessionMutation(request)) return;

  const impersonation = await getImpersonationState(request);
  if (impersonation.isReadOnly) {
    throw Response.json(
      {
        error: 'Read-only impersonation active',
        message: 'This session can view the app but cannot make changes.',
      },
      { status: 403 }
    );
  }

  const { getStudentPreviewState } = await import('./student-preview.server.ts');
  const preview = await getStudentPreviewState(request);
  if (preview.active) {
    throw Response.json(
      {
        error: 'Student preview active',
        message:
          'This session can view student pages but cannot make changes.',
      },
      { status: 403 }
    );
  }
}

export async function getUserId(request: Request) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    select: { user: { select: { id: true } } },
    where: { id: sessionId },
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
  await requireMutableRequest(request);
  return userId;
}

export async function requireMembership(
  request: Request,
  userId: string
): Promise<RequiredMembership> {
  const membershipId = await getMembershipId(request);

  if (membershipId) {
    const membership = await prisma.orgMembership.findUnique({
      where: { id: membershipId, userId },
      select: membershipSelect,
    });

    if (!membership) {
      throw redirect('/no-membership', {
        headers: { 'set-cookie': await setMembershipId('') },
      });
    }

    return membership;
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: membershipSelect,
  });

  if (!membership) {
    throw redirect('/no-membership');
  }

  return membership;
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
      memberships: { select: { id: true, isOrgOwner: true } },
    },
    where: { id: userId, memberships: { some: { isOrgOwner: true } } },
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
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const hashedPassword = await getPasswordHash(password);
  return prisma.user.update({
    where: { id: user.id },
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
      email: normalizeEmail(email),
      name,
      password: { create: { hash: hashedPassword } },
      memberships: {
        create: {
          isOrgOwner: false,
          role: 'STUDENT',
          organization: { connect: { id: 'default-org' } },
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
  const userWithPassword = await prisma.user.findFirst({
    where:
      'email' in where
        ? {
            email: {
              equals: normalizeEmail(where.email),
              mode: 'insensitive',
            },
          }
        : where,
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
