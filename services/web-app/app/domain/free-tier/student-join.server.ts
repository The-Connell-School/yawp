import { prisma } from '~/utils/db.server';
import { getPasswordHash } from '~/utils/auth.server';
import { getEntitlements } from '~/utils/entitlements.server';
import {
  suggestAvailableUsernames,
  validateUsername,
} from '~/utils/username.server';
import { getSessionExpirationDateForUser } from '~/utils/auth.server';

export type FreeTierClassSummary = {
  id: string;
  code: string;
  schoolYear: string;
  grade: string | null;
  period: string | null;
  school: { name: string; organizationId: string };
  teachers: { user: { name: string | null } }[];
};

export async function findFreeTierClassesByCode(
  code: string
): Promise<FreeTierClassSummary[]> {
  const trimmed = code.trim();
  if (!trimmed) return [];

  return prisma.class.findMany({
    where: {
      isArchived: false,
      code: { equals: trimmed, mode: 'insensitive' },
      school: { organization: { plan: 'FREE_CLASSROOM' } },
    },
    select: {
      id: true,
      code: true,
      schoolYear: true,
      grade: true,
      period: true,
      school: { select: { name: true, organizationId: true } },
      teachers: { select: { user: { select: { name: true } } } },
    },
    orderBy: [{ schoolYear: 'desc' }, { grade: 'asc' }, { period: 'asc' }],
    take: 20,
  });
}

async function assertClassHasSeat(classId: string, organizationId: string) {
  const entitlements = getEntitlements('FREE_CLASSROOM');
  const classRow = await prisma.class.findFirst({
    where: { id: classId, school: { organizationId } },
    select: { _count: { select: { students: true } } },
  });
  if (!classRow) {
    return { ok: false as const, error: 'Class not found.' };
  }
  if (
    !entitlements.canAddStudent({ currentStudents: classRow._count.students })
  ) {
    return {
      ok: false as const,
      error: 'This class is full. Ask your teacher for help.',
    };
  }
  return { ok: true as const };
}

export async function registerFreeTierStudent({
  name,
  username: rawUsername,
  password,
  classId,
}: {
  name: string;
  username: string;
  password: string;
  classId: string;
}) {
  const usernameResult = validateUsername(rawUsername);
  if (!usernameResult.ok) {
    const suggestions = await suggestAvailableUsernames(rawUsername);
    return {
      status: 'error' as const,
      field: 'username' as const,
      error: usernameResult.message,
      suggestions,
    };
  }

  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      isArchived: false,
      school: { organization: { plan: 'FREE_CLASSROOM' } },
    },
    select: {
      id: true,
      school: { select: { organizationId: true } },
    },
  });

  if (!klass) {
    return {
      status: 'error' as const,
      field: 'classId' as const,
      error: 'Class not found.',
    };
  }

  const seat = await assertClassHasSeat(
    klass.id,
    klass.school.organizationId
  );
  if (!seat.ok) {
    return {
      status: 'error' as const,
      field: 'classId' as const,
      error: seat.error,
    };
  }

  const taken = await prisma.user.findFirst({
    where: { username: usernameResult.username },
    select: { id: true },
  });
  if (taken) {
    const suggestions = await suggestAvailableUsernames(usernameResult.username);
    return {
      status: 'error' as const,
      field: 'username' as const,
      error: 'This handle is already taken.',
      suggestions,
    };
  }

  const hashedPassword = await getPasswordHash(password);
  const membership = await prisma.orgMembership.create({
    data: {
      user: {
        create: {
          name: name.trim(),
          username: usernameResult.username,
          password: { create: { hash: hashedPassword } },
        },
      },
      organization: { connect: { id: klass.school.organizationId } },
      role: 'STUDENT',
      classesAsStudent: { connect: { id: klass.id } },
    },
    select: { id: true, userId: true },
  });

  const session = await prisma.session.create({
    data: {
      userId: membership.userId,
      expirationDate: getSessionExpirationDateForUser({ email: null }),
    },
    select: { id: true, expirationDate: true },
  });

  return {
    status: 'ok' as const,
    membershipId: membership.id,
    session,
    userId: membership.userId,
  };
}

export async function teacherResetStudentPassword({
  studentMembershipId,
  classId,
  organizationId,
  actorUserId,
  temporaryPassword,
}: {
  studentMembershipId: string;
  classId: string;
  organizationId: string;
  actorUserId: string;
  temporaryPassword: string;
}) {
  const actor = await prisma.orgMembership.findFirst({
    where: {
      userId: actorUserId,
      organizationId,
      isActive: true,
      OR: [
        { isOrgOwner: true },
        {
          role: 'TEACHER',
          classesAsTeacher: { some: { id: classId } },
        },
      ],
    },
    select: { id: true },
  });
  if (!actor) {
    return { status: 'error' as const, error: 'Not authorized.' };
  }

  const student = await prisma.orgMembership.findFirst({
    where: {
      id: studentMembershipId,
      organizationId,
      role: 'STUDENT',
      isActive: true,
      classesAsStudent: { some: { id: classId } },
    },
    select: {
      userId: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!student) {
    return { status: 'error' as const, error: 'Student not found in this class.' };
  }

  const hash = await getPasswordHash(temporaryPassword);
  await prisma.$transaction([
    prisma.password.upsert({
      where: { userId: student.userId },
      create: { userId: student.userId, hash },
      update: { hash },
    }),
    prisma.user.update({
      where: { id: student.userId },
      data: { mustChangePassword: true },
    }),
    prisma.session.deleteMany({ where: { userId: student.userId } }),
  ]);

  return { status: 'ok' as const };
}
