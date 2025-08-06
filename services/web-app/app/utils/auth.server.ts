import { type Connection, type Password, type User } from '@app/prisma';
import { redirect } from 'react-router';
import bcrypt from 'bcryptjs';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { prisma } from './db.server.ts';
import { type FeatureFlags } from './featureFlags/index.ts';
import { DEFAULT_ROUTE, combineHeaders, downloadFile } from './misc.tsx';
import { authSessionStorage } from './session.server.ts';

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
  school,
  teacher,
  workshopTeacherId,
}: {
  email: User['email'];
  name: User['name'];
  password: string;
  school: string;
  teacher: string;
  grade: string;
  period: string;
  workshopTeacherId?: string;
}) {
  const hashedPassword = await getPasswordHash(password);
  
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      userRoles: {
        where: { organizationId: 'default-org' },
        include: { studentProfile: true },
      },
    },
  });

  let user: any;
  
  if (existingUser) {
    // User exists, update password and create/update user role for default org
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name,
        password: { update: { hash: hashedPassword } },
        userRoles: {
          upsert: {
            where: {
              userId_organizationId: {
                userId: existingUser.id,
                organizationId: 'default-org',
              },
            },
            create: {
              organizationId: 'default-org',
              studentProfile: {
                create: {
                  grade,
                  period,
                  school,
                  schoolTeacher: teacher,
                  workshopLeaderId: workshopTeacherId,
                },
              },
            },
            update: {
              studentProfile: {
                update: {
                  grade,
                  period,
                  school,
                  schoolTeacher: teacher,
                  workshopLeaderId: workshopTeacherId,
                },
              },
            },
          },
        },
      },
    });
  } else {
    // Create new user with user role for default org
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        password: { create: { hash: hashedPassword } },
        userRoles: {
          create: {
            organizationId: 'default-org',
            studentProfile: {
              create: {
                grade,
                period,
                school,
                schoolTeacher: teacher,
                workshopLeaderId: workshopTeacherId,
              },
            },
          },
        },
      },
    });
  }

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: { connect: { id: user.id } },
    },
    select: { id: true, expirationDate: true },
  });

  return session;
}

export async function signupAsTeacher({
  email,
  password,
  name,
}: {
  email: User['email'];
  name: User['name'];
  password: string;
}) {
  const hashedPassword = await getPasswordHash(password);

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: {
        create: {
          email: email.toLowerCase(),
          name,
          password: { create: { hash: hashedPassword } },
          // Note: For standalone teachers, we might need a default organization or handle differently
          // For now, leaving this as is since it might be legacy
        },
      },
    },
    select: { id: true, expirationDate: true },
  });

  return session;
}

export async function signupAsOrganizationTeacher({
  email,
  name,
  password,
  organizationId,
}: {
  email: User['email'];
  name: User['name'];
  password: string;
  organizationId: string;
}) {
  const hashedPassword = await getPasswordHash(password);

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: {
        create: {
          email: email.toLowerCase(),
          name,
          password: { create: { hash: hashedPassword } },
          userRoles: {
            create: {
              organizationId,
              teacherProfile: { create: {} },
              studentProfile: { create: {} },
            },
          },
        },
      },
    },
    select: { id: true, expirationDate: true },
  });

  return session;
}

export async function signupAsOrganizationStudent({
  email,
  name,
  password,
  organizationId,
}: {
  email: User['email'];
  name: User['name'];
  password: string;
  organizationId: string;
}) {
  const hashedPassword = await getPasswordHash(password);

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: {
        create: {
          email: email.toLowerCase(),
          name,
          password: { create: { hash: hashedPassword } },
          userRoles: {
            create: {
              organizationId,
              studentProfile: { create: {} },
            },
          },
        },
      },
    },
    select: { id: true, expirationDate: true },
  });

  return session;
}

export async function signupAsOrganizationOwner({
  email,
  name,
  password,
  organizationId,
}: {
  email: User['email'];
  name: User['name'];
  password: string;
  organizationId: string;
}) {
  const hashedPassword = await getPasswordHash(password);

  const existingUserRoles = await prisma.userRole.findMany({
    where: { organizationId },
    select: { id: true },
  });

  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: {
        create: {
          email: email.toLowerCase(),
          name,
          password: { create: { hash: hashedPassword } },
          userRoles: {
            create: {
              organizationId,
              isOwner: true,
              isSuperOwner: existingUserRoles.length === 0,
              studentProfile: { create: {} },
            },
          },
        },
      },
    },
    select: { id: true, expirationDate: true },
  });

  return session;
}

export async function signupWithConnection({
  email,
  name,
  providerId,
  providerName,
  imageUrl,
}: {
  email: User['email'];
  name: User['name'];
  providerId: Connection['providerId'];
  providerName: Connection['providerName'];
  imageUrl?: string;
}) {
  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      user: {
        create: {
          email: email.toLowerCase(),
          name,
          connections: { create: { providerId, providerName } },
          image: imageUrl
            ? { create: await downloadFile(imageUrl) }
            : undefined,
          // Note: Social auth users might not have organization context initially
          // This may need special handling in the onboarding flow
        },
      },
    },
    select: { id: true, expirationDate: true },
  });

  return session;
}

/**
 * Add an existing user to a new organization with specified role
 */
export async function addUserToOrganization({
  userId,
  organizationId,
  isOwner = false,
  isAdmin = false,
  isSuperOwner = false,
  createStudentProfile = false,
  createTeacherProfile = false,
}: {
  userId: string;
  organizationId: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isSuperOwner?: boolean;
  createStudentProfile?: boolean;
  createTeacherProfile?: boolean;
}) {
  // Check if user role already exists
  const existingUserRole = await prisma.userRole.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });

  if (existingUserRole) {
    throw new Error('User is already a member of this organization');
  }

  return prisma.userRole.create({
    data: {
      userId,
      organizationId,
      isOwner,
      isAdmin,
      isSuperOwner,
      studentProfile: createStudentProfile ? { create: {} } : undefined,
      teacherProfile: createTeacherProfile ? { create: {} } : undefined,
    },
  });
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

export async function redirectIfDisabled(
  name: FeatureFlags,
  redirectUrl?: string
) {
  const ff = await prisma.featureFlag.findUnique({ where: { name } });
  if (!ff?.isEnabled) return redirect(redirectUrl ?? DEFAULT_ROUTE);
}
