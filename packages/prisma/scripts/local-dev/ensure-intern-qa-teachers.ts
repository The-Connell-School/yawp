import type { PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';
import { currentSchoolYear } from '../../../../services/web-app/app/utils/school-year';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PASSWORD,
} from './dev-personas';

export const INTERN_QA_TEACHER_THOMAS = {
  name: 'Thomas Patton',
  preferredEmail: 'trpatton@crimson.ua.edu',
  fallbackEmail: 'dev.teacher.thomas@yawp.local',
  classCode: 'INTERN-QA-TP',
  classTitle: 'Intern QA — Thomas Patton',
  schoolCode: 'INTERN-QA-SCH-TP',
} as const;

export const INTERN_QA_TEACHER_AVA = {
  name: 'Ava Crossman',
  preferredEmail: 'aecrossman@crimson.ua.edu',
  fallbackEmail: 'dev.teacher.ava@yawp.local',
  classCode: 'INTERN-QA-AC',
  classTitle: 'Intern QA — Ava Crossman',
  schoolCode: 'INTERN-QA-SCH-AC',
} as const;

export const INTERN_QA_TEACHERS = [
  INTERN_QA_TEACHER_THOMAS,
  INTERN_QA_TEACHER_AVA,
] as const;

export type InternQaTeacherSpec = (typeof INTERN_QA_TEACHERS)[number];

export type EnsuredInternQaTeacher = {
  name: string;
  email: string;
  emailSource: 'preferred' | 'fallback';
  organizationId: string;
  classCode: string;
  classTitle: string;
  classId: string;
  studentCount: number;
};

export function isDemoInternQaEnvironment(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const slug = env.PREVIEW_SLUG ?? env.SLUG ?? '';
  const databaseName = env.DATABASE_NAME ?? '';
  const databaseUrl = env.DATABASE_URL ?? '';
  return (
    slug === 'demo' ||
    databaseName === 'yawp_demo' ||
    /\/yawp_demo(\?|$)/i.test(databaseUrl)
  );
}

export function assertEnsureInternQaTeachersTarget(
  databaseUrl = process.env.DATABASE_URL,
  env: NodeJS.ProcessEnv = process.env
) {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required');
  }
  if (
    /yawp_production/i.test(databaseUrl) ||
    env.YAWP_ENVIRONMENT === 'production'
  ) {
    throw new Error('ensure intern QA teachers refused on production database');
  }
  const requireDemo =
    env.ENSURE_INTERN_QA_REQUIRE_DEMO === '1' ||
    env.ENSURE_INTERN_QA_REQUIRE_DEMO === 'true';
  if (requireDemo && !isDemoInternQaEnvironment({ ...env, DATABASE_URL: databaseUrl })) {
    throw new Error(
      'ensure intern QA teachers requires demo (yawp_demo / PREVIEW_SLUG=demo)'
    );
  }
}

type MembershipRow = {
  organizationId: string;
  role: string;
  isActive: boolean;
};

export function canUsePreferredEmailForInternQa(
  user: {
    simulatedForClassId: string | null;
    memberships: MembershipRow[];
  } | null
): boolean {
  if (!user) return false;
  if (user.simulatedForClassId) return false;
  const localMembership = user.memberships.find(
    (membership) =>
      membership.organizationId === LOCAL_DEV_ORG_ID && membership.isActive
  );
  if (localMembership && localMembership.role !== 'TEACHER') {
    return false;
  }
  return true;
}

export function resolveInternQaTeacherEmail(
  spec: InternQaTeacherSpec,
  preferredUser: {
    email: string;
    simulatedForClassId?: string | null;
    memberships?: MembershipRow[];
  } | null,
  _fallbackUser: { email: string } | null
): { email: string; emailSource: 'preferred' | 'fallback' } {
  if (preferredUser && canUsePreferredEmailForInternQa(preferredUser)) {
    return { email: spec.preferredEmail, emailSource: 'preferred' };
  }
  return { email: spec.fallbackEmail, emailSource: 'fallback' };
}

async function ensureLocalDevOrganization(
  prisma: Pick<PrismaClient, 'organization'>
) {
  await prisma.organization.upsert({
    where: { id: LOCAL_DEV_ORG_ID },
    create: {
      id: LOCAL_DEV_ORG_ID,
      name: LOCAL_DEV_ORG_NAME,
      numOfStudentSeats: 200,
      numOfTeacherSeats: 40,
      reporterEnabled: true,
      writingPracticeEnabled: true,
    },
    update: {},
  });
}

async function ensureTeacherUser(
  prisma: PrismaClient,
  spec: InternQaTeacherSpec,
  email: string
) {
  const passwordHash = createPassword(LOCAL_DEV_PASSWORD).hash;
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { password: true },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name: spec.name },
    });
    if (!existing.password) {
      await prisma.password.create({
        data: { userId: existing.id, hash: passwordHash },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email,
      name: spec.name,
      password: { create: { hash: passwordHash } },
    },
  });
}

async function ensureTeacherMembership(
  prisma: PrismaClient,
  userId: string,
  schoolId: string
) {
  const membership = await prisma.orgMembership.upsert({
    where: {
      userId_organizationId: { userId, organizationId: LOCAL_DEV_ORG_ID },
    },
    create: {
      userId,
      organizationId: LOCAL_DEV_ORG_ID,
      role: 'TEACHER',
      isActive: true,
    },
    update: {
      role: 'TEACHER',
      isActive: true,
    },
  });
  await prisma.$executeRaw`
    INSERT INTO "_SchoolTeachers" ("A", "B")
    VALUES (${membership.id}, ${schoolId})
    ON CONFLICT DO NOTHING
  `;
  return membership;
}

async function ensureSchool(
  prisma: PrismaClient,
  spec: InternQaTeacherSpec
) {
  const existing = await prisma.school.findFirst({
    where: { organizationId: LOCAL_DEV_ORG_ID, code: spec.schoolCode },
    select: { id: true },
  });
  if (existing) return existing;
  const orgSchool = await prisma.school.findFirst({
    where: { organizationId: LOCAL_DEV_ORG_ID },
    orderBy: { createdAt: 'asc' },
    select: { id: true, code: true },
  });
  if (orgSchool) return orgSchool;
  return prisma.school.create({
    data: {
      organizationId: LOCAL_DEV_ORG_ID,
      name: `${spec.name} QA School`,
      code: spec.schoolCode,
    },
    select: { id: true },
  });
}

async function ensureEmptyTeacherClass(
  prisma: PrismaClient,
  spec: InternQaTeacherSpec,
  membershipId: string,
  schoolId: string
) {
  const schoolYear = currentSchoolYear();
  const art = getClassArtByIndex(4);
  let classRow = await prisma.class.findFirst({
    where: {
      schoolId,
      code: spec.classCode,
      isArchived: false,
    },
    include: {
      teachers: { select: { id: true } },
      students: { select: { id: true } },
    },
  });
  if (!classRow) {
    classRow = await prisma.class.create({
      data: {
        code: spec.classCode,
        schoolYear,
        period: '1',
        grade: '11',
        title: spec.classTitle,
        classArtKey: art.key,
        schoolId,
        teachers: { connect: [{ id: membershipId }] },
      },
      include: {
        teachers: { select: { id: true } },
        students: { select: { id: true } },
      },
    });
  } else {
    const teaches = classRow.teachers.some(
      (teacher) => teacher.id === membershipId
    );
    if (!teaches) {
      await prisma.class.update({
        where: { id: classRow.id },
        data: {
          isArchived: false,
          title: spec.classTitle,
          teachers: { connect: [{ id: membershipId }] },
        },
      });
    }
    if (classRow.students.length > 0) {
      await prisma.class.update({
        where: { id: classRow.id },
        data: {
          students: { set: [] },
        },
      });
    }
  }
  const studentCount = await prisma.orgMembership.count({
    where: {
      classesAsStudent: { some: { id: classRow.id } },
    },
  });
  return { classId: classRow.id, studentCount };
}

async function ensureOneInternQaTeacher(
  prisma: PrismaClient,
  spec: InternQaTeacherSpec
): Promise<EnsuredInternQaTeacher> {
  const [preferredUser, fallbackUser] = await Promise.all([
    prisma.user.findUnique({
      where: { email: spec.preferredEmail },
      select: {
        email: true,
        simulatedForClassId: true,
        memberships: {
          where: { organizationId: LOCAL_DEV_ORG_ID },
          select: { organizationId: true, role: true, isActive: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { email: spec.fallbackEmail },
      select: { id: true, email: true },
    }),
  ]);

  const { email, emailSource } = resolveInternQaTeacherEmail(
    spec,
    preferredUser,
    fallbackUser
  );

  const user = await ensureTeacherUser(prisma, spec, email);
  const school = await ensureSchool(prisma, spec);
  const membership = await ensureTeacherMembership(
    prisma,
    user.id,
    school.id
  );
  const { classId, studentCount } = await ensureEmptyTeacherClass(
    prisma,
    spec,
    membership.id,
    school.id
  );

  return {
    name: spec.name,
    email,
    emailSource,
    organizationId: LOCAL_DEV_ORG_ID,
    classCode: spec.classCode,
    classTitle: spec.classTitle,
    classId,
    studentCount,
  };
}

export async function ensureInternQaTeachers(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ teachers: EnsuredInternQaTeacher[] }> {
  assertEnsureInternQaTeachersTarget(process.env.DATABASE_URL, env);
  await ensureLocalDevOrganization(prisma);
  const teachers: EnsuredInternQaTeacher[] = [];
  for (const spec of INTERN_QA_TEACHERS) {
    teachers.push(await ensureOneInternQaTeacher(prisma, spec));
  }
  return { teachers };
}

export function formatEnsureInternQaTeachersSummary(result: {
  teachers: EnsuredInternQaTeacher[];
}) {
  return result.teachers
    .map(
      (teacher) =>
        `teacher name=${teacher.name} email=${teacher.email} org=${teacher.organizationId} class=${teacher.classCode} title=${teacher.classTitle} students=${teacher.studentCount} source=${teacher.emailSource}`
    )
    .join('\n');
}
