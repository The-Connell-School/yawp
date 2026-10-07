/* eslint-disable no-console */
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { LOCAL_DEV_PASSWORD } from './dev-personas';
import {
  FREE_CLASSROOM_ASSIGNMENT_KINDS,
  FREE_CLASSROOM_STUDENT_SEAT_CAP,
  FREE_CLASSROOM_TEACHER_SEAT_CAP,
} from '../../../../services/web-app/app/utils/entitlements.server';
import { seedFreeTierBundleAssignmentTypes } from '../seed-free-tier-bundle-assignment-types';
import { currentSchoolYear } from '../../../../services/web-app/app/utils/school-year';

export const PREVIEW_FREE_CLASSROOM_ORG_ID = 'preview-free-classroom';
export const PREVIEW_FREE_CLASSROOM_ORG_NAME = 'Yawp Preview — Free Classroom';
export const PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL =
  'dev.teacher.free@yawp.local';
export const PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL =
  'dev.student.free@yawp.local';
export const PREVIEW_FREE_CLASSROOM_SCHOOL_CODE = 'FREE-PREVIEW-1';

/** Leave one Class Starter slot for UI create → exhausted screenshot. */
export const PREVIEW_FREE_CLASSROOM_SEEDED_CLASS_STARTERS = 11;

type SeedClient = PrismaClient | Prisma.TransactionClient;

export async function ensurePreviewFreeClassroomFixture(
  prisma: PrismaClient
) {
  await seedFreeTierBundleAssignmentTypes(prisma);

  const bundleTypes = await prisma.assignmentType.findMany({
    where: { kind: { in: [...FREE_CLASSROOM_ASSIGNMENT_KINDS] } },
    select: { id: true, kind: true },
  });
  if (bundleTypes.length !== FREE_CLASSROOM_ASSIGNMENT_KINDS.length) {
    throw new Error('preview_free_classroom_bundle_types_missing');
  }

  const existing = await prisma.organization.findUnique({
    where: { id: PREVIEW_FREE_CLASSROOM_ORG_ID },
    select: { id: true },
  });
  if (!existing) {
    await prisma.$transaction(async (tx) => {
      await createPreviewFreeClassroomOrg(tx, bundleTypes);
    }, { maxWait: 10_000, timeout: 120_000 });
    console.log(
      `Preview free classroom fixture created (${PREVIEW_FREE_CLASSROOM_ORG_ID}).`
    );
    return { status: 'created' as const };
  }

  await topUpPreviewFreeClassroomAssignments(prisma, bundleTypes);
  console.log(
    `Preview free classroom fixture reconciled (${PREVIEW_FREE_CLASSROOM_ORG_ID}).`
  );
  return { status: 'existing' as const };
}

async function createPreviewFreeClassroomOrg(
  tx: SeedClient,
  bundleTypes: Array<{ id: string; kind: string | null }>
) {
  const now = new Date();
  await tx.organization.create({
    data: {
      id: PREVIEW_FREE_CLASSROOM_ORG_ID,
      name: PREVIEW_FREE_CLASSROOM_ORG_NAME,
      plan: 'FREE_CLASSROOM',
      planActivatedAt: now,
      numOfStudentSeats: FREE_CLASSROOM_STUDENT_SEAT_CAP,
      numOfTeacherSeats: FREE_CLASSROOM_TEACHER_SEAT_CAP,
      reporterEnabled: false,
      classInsightsEnabled: true,
      revisionFlowEnabled: true,
      writingPracticeEnabled: false,
    },
  });

  for (const type of bundleTypes) {
    await tx.organizationAssignmentType.create({
      data: {
        organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
        assignmentTypeId: type.id,
      },
    });
  }

  const school = await tx.school.create({
    data: {
      organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
      name: 'Free Classroom Preview School',
      code: PREVIEW_FREE_CLASSROOM_SCHOOL_CODE,
    },
    select: { id: true },
  });

  const teacher = await tx.user.create({
    data: {
      email: PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL,
      name: 'Free Tier Teacher',
      password: { create: createPassword(LOCAL_DEV_PASSWORD) },
      memberships: {
        create: {
          organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
          role: 'TEACHER',
          isOrgOwner: true,
          schools: { connect: { id: school.id } },
        },
      },
    },
    include: { memberships: true },
  });
  const teacherMembershipId = teacher.memberships[0]?.id;
  if (!teacherMembershipId) {
    throw new Error('preview_free_classroom_teacher_membership_missing');
  }

  const student = await tx.user.create({
    data: {
      email: PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL,
      name: 'Free Tier Student',
      password: { create: createPassword(LOCAL_DEV_PASSWORD) },
      memberships: {
        create: {
          organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
          role: 'STUDENT',
        },
      },
    },
    include: { memberships: true },
  });
  const studentMembershipId = student.memberships[0]?.id;
  if (!studentMembershipId) {
    throw new Error('preview_free_classroom_student_membership_missing');
  }

  const klass = await tx.class.create({
    data: {
      code: 'FREE-CLASS-101',
      schoolYear: currentSchoolYear(),
      title: 'Free Classroom — Period 1',
      grade: '11',
      period: '1',
      schoolId: school.id,
      teachers: { connect: { id: teacherMembershipId } },
      students: { connect: { id: studentMembershipId } },
    },
    select: { id: true },
  });

  await tx.freeTierApplication.create({
    data: {
      email: PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL,
      name: teacher.name ?? 'Free Tier Teacher',
      schoolName: 'Free Classroom Preview School',
      location: 'Preview',
      gradeLevel: '9-12',
      status: 'APPROVED',
      userId: teacher.id,
      organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
    },
  });

  const classStarterTypeId = bundleTypes.find(
    (row) => row.kind === 'class_starter'
  )?.id;
  if (!classStarterTypeId) {
    throw new Error('preview_free_classroom_class_starter_type_missing');
  }

  await seedClassStarterAssignments(
    tx,
    PREVIEW_FREE_CLASSROOM_ORG_ID,
    classStarterTypeId,
    klass.id,
    PREVIEW_FREE_CLASSROOM_SEEDED_CLASS_STARTERS
  );
}

async function topUpPreviewFreeClassroomAssignments(
  prisma: SeedClient,
  bundleTypes: Array<{ id: string; kind: string | null }>
) {
  const classStarterTypeId = bundleTypes.find(
    (row) => row.kind === 'class_starter'
  )?.id;
  if (!classStarterTypeId) return;

  const klass = await prisma.class.findFirst({
    where: {
      isArchived: false,
      school: { organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!klass) return;

  const existing = await prisma.assignment.count({
    where: {
      assignmentTypeId: classStarterTypeId,
      classAssignments: {
        some: {
          class: { school: { organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID } },
        },
      },
    },
  });

  if (existing >= PREVIEW_FREE_CLASSROOM_SEEDED_CLASS_STARTERS) return;

  await seedClassStarterAssignments(
    prisma,
    PREVIEW_FREE_CLASSROOM_ORG_ID,
    classStarterTypeId,
    klass.id,
    PREVIEW_FREE_CLASSROOM_SEEDED_CLASS_STARTERS - existing
  );
}

async function seedClassStarterAssignments(
  client: SeedClient,
  organizationId: string,
  assignmentTypeId: string,
  classId: string,
  count: number
) {
  for (let index = 0; index < count; index += 1) {
    await client.assignment.create({
      data: {
        assignmentTypeId,
        title: `Preview Class Starter ${index + 1}`,
        prompt: 'Seeded for free classroom quota preview QA.',
        submitForGrade: true,
        classAssignments: {
          create: { classId },
        },
      },
    });
  }
  const deployedCount = await client.assignment.count({
    where: {
      assignmentTypeId,
      classAssignments: {
        some: { class: { school: { organizationId } } },
      },
    },
  });
  await client.freeClassroomAssignmentKindUsage.upsert({
    where: {
      organizationId_kind: { organizationId, kind: 'class_starter' },
    },
    create: {
      organizationId,
      kind: 'class_starter',
      lifetimeCreatedCount: deployedCount,
    },
    update: { lifetimeCreatedCount: deployedCount },
  });
  console.log(
    `Seeded ${count} class starter assignment(s) for ${organizationId}.`
  );
}
