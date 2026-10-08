import { getImpersonationAttribution } from './internal-impersonation-context.server';
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
  isActive: true,
  organization: {
    select: {
      id: true,
      name: true,
      plan: true,
      reporterEnabled: true,
      classInsightsEnabled: true,
      writingPracticeEnabled: true,
      submissionActivityEnabled: true,
      revisionFlowEnabled: true,
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
export const HANDLE_ONLY_SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 12;

export const getSessionExpirationDate = () =>
  new Date(Date.now() + SESSION_EXPIRATION_TIME);

export function getSessionExpirationDateForUser(user: {
  email: string | null;
}) {
  if (!user.email) {
    return new Date(Date.now() + HANDLE_ONLY_SESSION_EXPIRATION_TIME);
  }
  return getSessionExpirationDate();
}

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
]);

function isMutationRequest(request: Request) {
  return !mutationSafeMethods.has(request.method.toUpperCase());
}

function isAllowedReadOnlySessionMutation(request: Request) {
  return readOnlySessionAllowedMutationPaths.has(new URL(request.url).pathname);
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
}

export async function getUserId(request: Request) {
  const internal = getImpersonationAttribution();
  if (internal) return internal.userId;
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    select: {
      expirationDate: true,
      user: { select: { id: true, email: true } },
    },
    where: { id: sessionId },
  });
  if (!session?.user) {
    throw redirect('/', {
      headers: {
        'set-cookie': await authSessionStorage.destroySession(authSession),
      },
    });
  }
  if (session.expirationDate.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    throw redirect('/', {
      headers: {
        'set-cookie': await authSessionStorage.destroySession(authSession),
      },
    });
  }
  return session.user.id;
}

/** Cookie expiry for the auth session: rolling for email users, fixed for handle-only. */
export async function getAuthSessionCookieExpiresAt(params: {
  sessionId: string;
  userEmail: string | null;
}) {
  if (params.userEmail) {
    return getSessionExpirationDateForUser({ email: params.userEmail });
  }
  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { expirationDate: true },
  });
  return session?.expirationDate ?? new Date(0);
}

export async function requireUserId(
  request: Request,
  { redirectTo, skipPasswordChangeGate = false }: { redirectTo?: string | null; skipPasswordChangeGate?: boolean } = {}
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
  if (!skipPasswordChangeGate) {
    await requireUserWithoutPasswordChange(request, userId);
  }
  await requireMutableRequest(request);
  return userId;
}

export async function requireMembership(
  request: Request,
  userId: string,
  { allowPaymentRequired = false }: { allowPaymentRequired?: boolean } = {}
): Promise<RequiredMembership> {
  const membershipId = await getMembershipId(request);

  if (membershipId) {
    const membership = await prisma.orgMembership.findUnique({
      where: { id: membershipId, userId, isActive: true },
      select: membershipSelect,
    });

    if (!membership) {
      throw redirect('/no-membership', {
        headers: { 'set-cookie': await setMembershipId('') },
      });
    }

    return requireLicensedMembership(request, membership, allowPaymentRequired);
  }

  // Prefer a real school/org membership over the legacy `default-org` shell.
  // Students who were seeded into default-org and later joined a school org
  // otherwise land in an empty org (createdAt asc) and look "locked out"
  // even though their password and class membership are fine.
  const memberships = await prisma.orgMembership.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: membershipSelect,
  });

  const membership =
    memberships.find((m) => m.organization.id !== 'default-org') ??
    memberships[0];

  if (!membership) {
    throw redirect('/no-membership');
  }

  return requireLicensedMembership(request, membership, allowPaymentRequired);
}

async function requireLicensedMembership(
  request: Request,
  membership: RequiredMembership,
  allowPaymentRequired: boolean
) {
  if (allowPaymentRequired) return membership;

  // Support/admin read-only impersonation must remain able to inspect a broken
  // or unpaid account without mutating its billing state.
  const impersonation = await getImpersonationState(request);
  if (impersonation.isReadOnly) return membership;

  const { getUaStudentLicenseAccess } =
    await import('~/domain/student-license/student-license.server');
  const access = await getUaStudentLicenseAccess({
    id: membership.id,
    role: membership.role,
    organizationId: membership.organization.id,
  });

  if (access === 'PAYMENT_REQUIRED') throw redirect('/billing/ua');
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
        message: 'Unauthorized: required role: isAdmin',
      },
      { status: 403 }
    );
  }

  return user;
}

export async function requireSuperAdmin(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    select: { id: true },
    where: { id: userId, isSuperAdmin: true },
  });
  if (!user) {
    throw data(
      {
        error: 'Unauthorized',
        requiredRole: 'isSuperAdmin',
        message: 'Unauthorized: required role: isSuperAdmin',
      },
      { status: 403 }
    );
  }
  return user;
}

/**
 * Ownership of the organization the request is actually scoped to.
 *
 * The organization every caller of this helper goes on to query comes from
 * `requireMembership`, which resolves the user-switchable `membership-id` cookie. So the
 * ownership predicate is pinned to that same resolved membership: being an owner of some
 * other organization does not admit you here. Resolving the membership inside this helper
 * rather than leaving each route to pair the two calls itself is what keeps them from
 * drifting apart again.
 */
export async function requireOwner(request: Request) {
  const userId = await requireUserId(request);
  const activeMembership = await requireMembership(request, userId);
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      memberships: { select: { id: true, isOrgOwner: true } },
    },
    where: {
      id: userId,
      memberships: { some: { id: activeMembership.id, isOrgOwner: true } },
    },
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
  email: NonNullable<User['email']>;
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
  email: NonNullable<User['email']>;
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

export async function findUserForLoginIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    const email = normalizeEmail(trimmed);
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        mustChangePassword: true,
        password: { select: { hash: true } },
      },
    });
  }
  const { normalizeUsername } = await import('./username.server');
  const username = normalizeUsername(trimmed);
  return prisma.user.findFirst({
    where: { username },
    select: {
      id: true,
      email: true,
      mustChangePassword: true,
      password: { select: { hash: true } },
    },
  });
}

export async function verifyUserPassword(
  where: Pick<User, 'email'> | Pick<User, 'id'> | { login: string },
  password: Password['hash']
) {
  const userWithPassword =
    'login' in where
      ? await findUserForLoginIdentifier(where.login)
      : await prisma.user.findFirst({
          where:
            'email' in where && where.email
              ? {
                  email: {
                    equals: normalizeEmail(where.email),
                    mode: 'insensitive',
                  },
                }
              : where,
          select: {
            id: true,
            email: true,
            mustChangePassword: true,
            password: { select: { hash: true } },
          },
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

  return {
    id: userWithPassword.id,
    email: userWithPassword.email,
    mustChangePassword: userWithPassword.mustChangePassword,
  };
}

export async function requireUserWithoutPasswordChange(
  request: Request,
  userId: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mustChangePassword: true },
  });
  const pathname = new URL(request.url).pathname;
  const allowed =
    pathname.startsWith('/auth/required-password-change') ||
    pathname === '/auth/logout';
  if (user?.mustChangePassword && !allowed) {
    throw redirect('/auth/required-password-change');
  }
}

export async function clearMustChangePassword(userId: string, password: string) {
  const hash = await getPasswordHash(password);
  await prisma.$transaction([
    prisma.password.upsert({
      where: { userId },
      create: { userId, hash },
      update: { hash },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { mustChangePassword: false },
    }),
  ]);
}
