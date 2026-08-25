/* eslint-disable no-console */
import { createPrismaClient } from './local-dev/connection';
import { createPassword } from './utils';
import { getClassArtByIndex } from '../../../services/web-app/app/utils/class-art.ts';
import type { Prisma } from '../generated/prisma';

export const PRODUCTION_QA_IDS = {
  organizationId: 'prod-qa-v3-org',
  schoolId: 'prod-qa-v3-school',
  schoolCode: 'PROD-QA-V3',
  classId: 'prod-qa-v3-class',
  classCode: 'PROD-QA-V3-CLASS',
  teacherUserId: 'prod-qa-v3-teacher-user',
  teacherMembershipId: 'prod-qa-v3-teacher-membership',
  teacherEmail: 'prod.qa.teacher.v3@brock.software',
  studentUserId: 'prod-qa-v3-student-user',
  studentMembershipId: 'prod-qa-v3-student-membership',
  studentEmail: 'prod.qa.student.v3@brock.software',
  assignmentTypeId: 'prod-qa-v3-writing-assignment-type',
  assignmentId: 'prod-qa-v3-writing-assignment',
  classAssignmentId: 'prod-qa-v3-class-assignment',
  documentId: 'prod-qa-v3-student-document',
  submissionId: 'prod-qa-v3-released-submission',
} as const;

export const PRODUCTION_QA_ORGANIZATION_FLAGS = {
  submissionActivityEnabled: true,
} as const;

const DEFAULT_FIXTURE_PASSWORDS = new Set([
  'teacher-e2e-password',
  'admin-e2e-password',
  'johndoe',
  'teacher123',
  'student123',
  'admin123',
  'yawp-dev',
]);

const QA_SCORING_SCALE = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

const QA_RUBRIC = {
  categories: [
    {
      key: 'clarity',
      label: 'Clarity',
      description: 'The response is clear and easy to follow.',
      weight: 0.4,
    },
    {
      key: 'evidence',
      label: 'Evidence',
      description: 'The response uses concrete details.',
      weight: 0.4,
    },
    {
      key: 'mechanics',
      label: 'Mechanics',
      description: 'Grammar and mechanics support readability.',
      weight: 0.2,
    },
  ],
};

const QA_OUTPUT_SCHEMA = {
  schemaVersion: 1,
  responseShape: 'categories_overall_comment',
};

export type ProductionQaProfileResult = {
  organizationId: string;
  teacherEmail: string;
  studentEmail: string;
  schoolId: string;
  classId: string;
  assignmentTypeId: string;
  assignmentId: string;
  classAssignmentId: string;
  documentId: string;
  submissionId: string;
  password?: string;
  passwordHash?: string;
};

export function assertProductionQaPassword(password: string | undefined) {
  if (!password) {
    throw new Error('Set PROD_QA_PASSWORD before provisioning production QA.');
  }
  if (DEFAULT_FIXTURE_PASSWORDS.has(password)) {
    throw new Error('PROD_QA_PASSWORD cannot reuse a known fixture password.');
  }
  if (password.length < 12) {
    throw new Error('PROD_QA_PASSWORD must be at least 12 characters.');
  }
  return password;
}

export function redactedProductionQaSummary(result: ProductionQaProfileResult) {
  return {
    organizationId: result.organizationId,
    teacherEmail: result.teacherEmail,
    studentEmail: result.studentEmail,
    schoolId: result.schoolId,
    classId: result.classId,
    assignmentTypeId: result.assignmentTypeId,
    assignmentId: result.assignmentId,
    classAssignmentId: result.classAssignmentId,
    documentId: result.documentId,
    submissionId: result.submissionId,
    passwordConfigured: Boolean(result.password || result.passwordHash),
  };
}

type RootPrismaClient = ReturnType<typeof createPrismaClient>;
type PrismaClientLike = RootPrismaClient | Prisma.TransactionClient;

export type ProductionQaFixtureCollision = {
  resource: string;
  reason: string;
};

export function assertNoProductionQaFixtureCollisions(
  collisions: ProductionQaFixtureCollision[]
) {
  if (collisions.length === 0) return;
  const details = collisions
    .map(({ resource, reason }) => `${resource}: ${reason}`)
    .join('; ');
  throw new Error(
    `Production QA fixture graph collision; refusing to mutate production. ${details}`
  );
}

type QaIdentityRecord = {
  id: string;
  email: string;
  memberships: Array<{
    id: string;
    userId: string;
    organizationId: string;
    role: 'TEACHER' | 'STUDENT';
    isOrgOwner: boolean;
  }>;
};

type QaMembershipRecord = QaIdentityRecord['memberships'][number];

export function assertProductionQaIdentitySafety({
  users,
  memberships,
}: {
  users: QaIdentityRecord[];
  memberships: QaMembershipRecord[];
}) {
  const expected = [
    {
      userId: PRODUCTION_QA_IDS.teacherUserId,
      email: PRODUCTION_QA_IDS.teacherEmail,
      membershipId: PRODUCTION_QA_IDS.teacherMembershipId,
      role: 'TEACHER' as const,
      isOrgOwner: true,
    },
    {
      userId: PRODUCTION_QA_IDS.studentUserId,
      email: PRODUCTION_QA_IDS.studentEmail,
      membershipId: PRODUCTION_QA_IDS.studentMembershipId,
      role: 'STUDENT' as const,
      isOrgOwner: false,
    },
  ];

  for (const identity of expected) {
    const matchingUsers = users.filter(
      (user) => user.id === identity.userId || user.email === identity.email
    );
    if (matchingUsers.length > 1) {
      throw new Error(
        `Production QA identity collision for ${identity.email}; refusing to mutate production.`
      );
    }
    const user = matchingUsers[0];
    if (
      user &&
      (user.id !== identity.userId || user.email !== identity.email)
    ) {
      throw new Error(
        `Production QA reserved email or user ID collision for ${identity.email}; refusing to mutate production.`
      );
    }
    if (
      user?.memberships.some(
        (membership) =>
          membership.id !== identity.membershipId ||
          membership.organizationId !== PRODUCTION_QA_IDS.organizationId ||
          membership.role !== identity.role ||
          membership.isOrgOwner !== identity.isOrgOwner
      )
    ) {
      throw new Error(
        `Production QA user ${identity.email} has a non-QA membership graph; refusing to mutate production.`
      );
    }

    const reservedMembership = memberships.find(
      (membership) => membership.id === identity.membershipId
    );
    if (
      reservedMembership &&
      (reservedMembership.userId !== identity.userId ||
        reservedMembership.organizationId !==
          PRODUCTION_QA_IDS.organizationId ||
        reservedMembership.role !== identity.role ||
        reservedMembership.isOrgOwner !== identity.isOrgOwner)
    ) {
      throw new Error(
        `Production QA reserved membership collision for ${identity.membershipId}; refusing to mutate production.`
      );
    }
  }
}

async function assertProductionQaIdentityPreflight(prisma: PrismaClientLike) {
  const ids = PRODUCTION_QA_IDS;
  const [users, memberships] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { id: { in: [ids.teacherUserId, ids.studentUserId] } },
          { email: { in: [ids.teacherEmail, ids.studentEmail] } },
        ],
      },
      select: {
        id: true,
        email: true,
        memberships: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
            role: true,
            isOrgOwner: true,
          },
        },
      },
    }),
    prisma.orgMembership.findMany({
      where: {
        id: { in: [ids.teacherMembershipId, ids.studentMembershipId] },
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        isOrgOwner: true,
      },
    }),
  ]);
  assertProductionQaIdentitySafety({ users, memberships });
}

export async function assertProductionQaFixturePreflight(
  prisma: PrismaClientLike
) {
  const ids = PRODUCTION_QA_IDS;
  const collisions = await prisma.$queryRaw<ProductionQaFixtureCollision[]>`
    SELECT 'Organization' AS resource, 'reserved ID has a non-QA name' AS reason
    FROM "Organization"
    WHERE id = ${ids.organizationId} AND name <> 'Yawp Production QA'
    UNION ALL
    SELECT 'School', 'reserved ID or code is not the exact QA school'
    FROM "School"
    WHERE (id = ${ids.schoolId} OR code = ${ids.schoolCode})
      AND NOT (
        id = ${ids.schoolId}
        AND code = ${ids.schoolCode}
        AND "organizationId" = ${ids.organizationId}
      )
    UNION ALL
    SELECT 'Class', 'reserved ID or school/code key is not the exact QA class'
    FROM "Class"
    WHERE (
      id = ${ids.classId}
      OR ("schoolId" = ${ids.schoolId} AND code = ${ids.classCode})
    )
      AND NOT (
        id = ${ids.classId}
        AND "schoolId" = ${ids.schoolId}
        AND code = ${ids.classCode}
      )
    UNION ALL
    SELECT 'AssignmentType', 'reserved ID is not owned by the QA organization'
    FROM "AssignmentType"
    WHERE id = ${ids.assignmentTypeId}
      AND "ownerOrgId" IS DISTINCT FROM ${ids.organizationId}
    UNION ALL
    SELECT 'Assignment', 'reserved ID is not owned by the QA assignment type'
    FROM "Assignment"
    WHERE id = ${ids.assignmentId}
      AND "assignmentTypeId" IS DISTINCT FROM ${ids.assignmentTypeId}
    UNION ALL
    SELECT 'ClassAssignment', 'reserved ID or compound key is not the exact QA link'
    FROM "ClassAssignment"
    WHERE (
      id = ${ids.classAssignmentId}
      OR (
        "assignmentId" = ${ids.assignmentId}
        AND "classId" = ${ids.classId}
      )
    )
      AND NOT (
        id = ${ids.classAssignmentId}
        AND "assignmentId" = ${ids.assignmentId}
        AND "classId" = ${ids.classId}
      )
    UNION ALL
    SELECT 'Document', 'reserved ID is not the exact QA-owned document'
    FROM "Document"
    WHERE id = ${ids.documentId}
      AND NOT (
        "membershipId" = ${ids.studentMembershipId}
        AND "assignmentTypeId" = ${ids.assignmentTypeId}
        AND "assignmentId" = ${ids.assignmentId}
        AND "classAssignmentId" = ${ids.classAssignmentId}
      )
    UNION ALL
    SELECT 'Submission', 'reserved ID is not attached to the QA document'
    FROM "Submission"
    WHERE id = ${ids.submissionId}
      AND "documentId" IS DISTINCT FROM ${ids.documentId}
    UNION ALL
    SELECT 'OrgMembership', 'QA organization contains an unexpected membership'
    FROM "OrgMembership"
    WHERE "organizationId" = ${ids.organizationId}
      AND id NOT IN (${ids.teacherMembershipId}, ${ids.studentMembershipId})
    UNION ALL
    SELECT 'School', 'QA organization contains an unexpected school'
    FROM "School"
    WHERE "organizationId" = ${ids.organizationId}
      AND id <> ${ids.schoolId}
    UNION ALL
    SELECT 'AssignmentType', 'QA organization owns an unexpected assignment type'
    FROM "AssignmentType"
    WHERE "ownerOrgId" = ${ids.organizationId}
      AND id <> ${ids.assignmentTypeId}
    UNION ALL
    SELECT 'OrganizationAssignmentType', 'QA organization has an unexpected assignment-type link'
    FROM "OrganizationAssignmentType"
    WHERE "organizationId" = ${ids.organizationId}
      AND "assignmentTypeId" <> ${ids.assignmentTypeId}
    UNION ALL
    SELECT 'Class', 'QA school contains an unexpected class'
    FROM "Class"
    WHERE "schoolId" = ${ids.schoolId}
      AND id <> ${ids.classId}
    UNION ALL
    SELECT 'Assignment', 'QA assignment type contains an unexpected assignment'
    FROM "Assignment"
    WHERE "assignmentTypeId" = ${ids.assignmentTypeId}
      AND id <> ${ids.assignmentId}
    UNION ALL
    SELECT 'ClassAssignment', 'QA class contains an unexpected assignment link'
    FROM "ClassAssignment"
    WHERE "classId" = ${ids.classId}
      AND id <> ${ids.classAssignmentId}
    UNION ALL
    SELECT 'Document', 'QA identities or assignment contain an unexpected document'
    FROM "Document"
    WHERE (
      "membershipId" IN (${ids.teacherMembershipId}, ${ids.studentMembershipId})
      OR "classAssignmentId" = ${ids.classAssignmentId}
    )
      AND id <> ${ids.documentId}
    UNION ALL
    SELECT 'Submission', 'QA document contains an unexpected submission'
    FROM "Submission"
    WHERE "documentId" = ${ids.documentId}
      AND id <> ${ids.submissionId}
    UNION ALL
    SELECT 'SubmissionActivity', 'QA organization contains activity for another submission'
    FROM "SubmissionActivity"
    WHERE "organizationId" = ${ids.organizationId}
      AND "submissionId" <> ${ids.submissionId}
    UNION ALL
    SELECT 'ClassTeachers', 'QA class teacher roster contains an unexpected link'
    FROM "_ClassTeachers"
    WHERE "A" = ${ids.classId}
      AND "B" <> ${ids.teacherMembershipId}
    UNION ALL
    SELECT 'ClassTeachers', 'QA teacher is linked to another class'
    FROM "_ClassTeachers"
    WHERE "B" = ${ids.teacherMembershipId}
      AND "A" <> ${ids.classId}
    UNION ALL
    SELECT 'ClassStudents', 'QA class student roster contains an unexpected link'
    FROM "_ClassStudents"
    WHERE "A" = ${ids.classId}
      AND "B" <> ${ids.studentMembershipId}
    UNION ALL
    SELECT 'ClassStudents', 'QA student is linked to another class'
    FROM "_ClassStudents"
    WHERE "B" = ${ids.studentMembershipId}
      AND "A" <> ${ids.classId}
    UNION ALL
    SELECT 'SchoolTeachers', 'QA school teacher roster contains an unexpected link'
    FROM "_SchoolTeachers"
    WHERE "B" = ${ids.schoolId}
      AND "A" <> ${ids.teacherMembershipId}
    UNION ALL
    SELECT 'SchoolTeachers', 'QA teacher is linked to another school'
    FROM "_SchoolTeachers"
    WHERE "A" = ${ids.teacherMembershipId}
      AND "B" <> ${ids.schoolId}
  `;
  assertNoProductionQaFixtureCollisions(collisions);
}

async function ensureQaUser({
  prisma,
  id,
  email,
  name,
  password,
}: {
  prisma: PrismaClientLike;
  id: string;
  email: string;
  name: string;
  password: string;
}) {
  const passwordHash = createPassword(password).hash;
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name, isAdmin: false, isSuperAdmin: false },
      })
    : await prisma.user.create({
        data: {
          id,
          email,
          name,
          isAdmin: false,
          isSuperAdmin: false,
        },
      });

  await prisma.password.upsert({
    where: { userId: user.id },
    update: { hash: passwordHash },
    create: { userId: user.id, hash: passwordHash },
  });

  return user;
}

async function ensureQaMembership({
  prisma,
  id,
  userId,
  role,
  isOrgOwner,
}: {
  prisma: PrismaClientLike;
  id: string;
  userId: string;
  role: 'TEACHER' | 'STUDENT';
  isOrgOwner: boolean;
}) {
  return prisma.orgMembership.upsert({
    where: {
      userId_organizationId: {
        userId,
        organizationId: PRODUCTION_QA_IDS.organizationId,
      },
    },
    update: { role, isOrgOwner, isActive: true },
    create: {
      id,
      userId,
      organizationId: PRODUCTION_QA_IDS.organizationId,
      role,
      isOrgOwner,
      isActive: true,
    },
  });
}

async function provisionProductionQaProfile(
  prisma: PrismaClientLike,
  password: string
): Promise<ProductionQaProfileResult> {
  const ids = PRODUCTION_QA_IDS;
  const classArtKey = getClassArtByIndex(0).key;

  // This read-only collision check must run before the first write. Reserved
  // QA emails and IDs are never authority to reset an unrelated account.
  await assertProductionQaIdentityPreflight(prisma);
  await assertProductionQaFixturePreflight(prisma);

  const org = await prisma.organization.upsert({
    where: { id: ids.organizationId },
    update: {
      name: 'Yawp Production QA',
      numOfTeacherSeats: 5,
      numOfStudentSeats: 10,
      accessExpiresAt: new Date('2035-01-01T00:00:00.000Z'),
      ...PRODUCTION_QA_ORGANIZATION_FLAGS,
    },
    create: {
      id: ids.organizationId,
      name: 'Yawp Production QA',
      numOfTeacherSeats: 5,
      numOfStudentSeats: 10,
      accessExpiresAt: new Date('2035-01-01T00:00:00.000Z'),
      ...PRODUCTION_QA_ORGANIZATION_FLAGS,
    },
  });

  const existingSchool = await prisma.school.findUnique({
    where: { code: ids.schoolCode },
  });
  if (existingSchool && existingSchool.organizationId !== org.id) {
    throw new Error(
      `School code ${ids.schoolCode} belongs to a non-QA organization.`
    );
  }
  const school = existingSchool
    ? await prisma.school.update({
        where: { id: existingSchool.id },
        data: {
          name: 'Yawp Production QA School',
          organizationId: org.id,
        },
      })
    : await prisma.school.create({
        data: {
          id: ids.schoolId,
          name: 'Yawp Production QA School',
          code: ids.schoolCode,
          organizationId: org.id,
        },
      });

  const teacherUser = await ensureQaUser({
    prisma,
    id: ids.teacherUserId,
    email: ids.teacherEmail,
    name: 'Production QA Teacher',
    password,
  });
  const studentUser = await ensureQaUser({
    prisma,
    id: ids.studentUserId,
    email: ids.studentEmail,
    name: 'Production QA Student',
    password,
  });

  const teacherMembership = await ensureQaMembership({
    prisma,
    id: ids.teacherMembershipId,
    userId: teacherUser.id,
    role: 'TEACHER',
    isOrgOwner: true,
  });
  const studentMembership = await ensureQaMembership({
    prisma,
    id: ids.studentMembershipId,
    userId: studentUser.id,
    role: 'STUDENT',
    isOrgOwner: false,
  });

  await prisma.$executeRaw`
    INSERT INTO "_SchoolTeachers" ("A", "B")
    VALUES (${teacherMembership.id}, ${school.id})
    ON CONFLICT DO NOTHING
  `;

  const klass = await prisma.class.upsert({
    where: {
      schoolId_code: {
        schoolId: school.id,
        code: ids.classCode,
      },
    },
    update: {
      id: ids.classId,
      title: 'Production QA Writing Lab',
      schoolYear: '2026-2027',
      period: 'QA',
      grade: '9th',
      classArtKey,
      isArchived: false,
    },
    create: {
      id: ids.classId,
      code: ids.classCode,
      title: 'Production QA Writing Lab',
      schoolYear: '2026-2027',
      period: 'QA',
      grade: '9th',
      schoolId: school.id,
      classArtKey,
      isArchived: false,
    },
  });

  await prisma.class.update({
    where: { id: klass.id },
    data: {
      teachers: { connect: { id: teacherMembership.id } },
      students: { connect: { id: studentMembership.id } },
    },
  });

  const assignmentType = await prisma.assignmentType.upsert({
    where: { id: ids.assignmentTypeId },
    update: {
      title: 'Production QA Writing',
      description:
        'QA-only fixture assignment type for production smoke tests.',
      position: 9000,
      archivedAt: null,
      ownerOrgId: org.id,
      scoringScaleJson: QA_SCORING_SCALE,
      rubricJson: QA_RUBRIC,
      gradingPromptConfigJson: {
        instructionsPreset: 'production_qa_writing',
      },
      gradingOutputSchemaJson: QA_OUTPUT_SCHEMA,
      gradingCalibrationNotes: 'Production QA fixture. Safe to reset.',
      gradingAssistantVersion: 1,
    },
    create: {
      id: ids.assignmentTypeId,
      title: 'Production QA Writing',
      description:
        'QA-only fixture assignment type for production smoke tests.',
      position: 9000,
      ownerOrgId: org.id,
      scoringScaleJson: QA_SCORING_SCALE,
      rubricJson: QA_RUBRIC,
      gradingPromptConfigJson: {
        instructionsPreset: 'production_qa_writing',
      },
      gradingOutputSchemaJson: QA_OUTPUT_SCHEMA,
      gradingCalibrationNotes: 'Production QA fixture. Safe to reset.',
      gradingAssistantVersion: 1,
    },
  });

  await prisma.organizationAssignmentType.upsert({
    where: {
      organizationId_assignmentTypeId: {
        organizationId: org.id,
        assignmentTypeId: assignmentType.id,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      assignmentTypeId: assignmentType.id,
    },
  });

  const assignment = await prisma.assignment.upsert({
    where: { id: ids.assignmentId },
    update: {
      assignmentTypeId: assignmentType.id,
      title: 'Production QA Short Response',
      prompt:
        'Write one paragraph describing how a production QA fixture should behave.',
      submitForGrade: true,
      pointValue: 100,
    },
    create: {
      id: ids.assignmentId,
      assignmentTypeId: assignmentType.id,
      title: 'Production QA Short Response',
      prompt:
        'Write one paragraph describing how a production QA fixture should behave.',
      submitForGrade: true,
      pointValue: 100,
    },
  });

  const classAssignment = await prisma.classAssignment.upsert({
    where: { id: ids.classAssignmentId },
    update: {
      assignmentId: assignment.id,
      classId: klass.id,
    },
    create: {
      id: ids.classAssignmentId,
      assignmentId: assignment.id,
      classId: klass.id,
    },
  });

  const documentText =
    'This production QA document is disposable and belongs only to prod-qa-v3-org.';
  const document = await prisma.document.upsert({
    where: { id: ids.documentId },
    update: {
      title: 'Production QA Student Draft',
      text: documentText,
      html: `<p>${documentText}</p>`,
      membershipId: studentMembership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: assignment.id,
      classAssignmentId: classAssignment.id,
      archivedAt: null,
      deletedAt: null,
    },
    create: {
      id: ids.documentId,
      title: 'Production QA Student Draft',
      text: documentText,
      html: `<p>${documentText}</p>`,
      membershipId: studentMembership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: assignment.id,
      classAssignmentId: classAssignment.id,
    },
  });

  // Reset only the disposable QA submission. Durable activity elsewhere,
  // including real classroom data, remains untouched.
  await prisma.$executeRawUnsafe(
    "SET LOCAL yawp.submission_activity_cleanup = 'on'"
  );
  await prisma.submissionActivity.deleteMany({
    where: {
      submissionId: ids.submissionId,
      organizationId: ids.organizationId,
    },
  });
  const releasedAt = new Date('2026-08-20T12:00:00.000Z');
  const submission = await prisma.submission.upsert({
    where: { id: ids.submissionId },
    update: {
      documentId: document.id,
      title: 'Production QA Released Submission',
      text: documentText,
      html: `<p>${documentText}</p>`,
      submittedAt: new Date('2026-08-20T11:00:00.000Z'),
      gradedAt: releasedAt,
      gradedByMembershipId: teacherMembership.id,
      releasedAt,
      numericPercentage: 77,
      letterGrade: 'C+',
      score: '77% (C+)',
      overallComment: 'Production QA baseline feedback.',
      feedback: 'Production QA baseline feedback.',
      rubricScores: {
        clarity: { score: 4, comment: 'Clear baseline.' },
        evidence: { score: 3, comment: 'Add detail.' },
        mechanics: { score: 4, comment: 'Readable.' },
      },
      archivedAt: null,
      unsubmittedAt: null,
      unsubmittedByMembershipId: null,
    },
    create: {
      id: ids.submissionId,
      documentId: document.id,
      title: 'Production QA Released Submission',
      text: documentText,
      html: `<p>${documentText}</p>`,
      submittedAt: new Date('2026-08-20T11:00:00.000Z'),
      gradedAt: releasedAt,
      gradedByMembershipId: teacherMembership.id,
      releasedAt,
      numericPercentage: 77,
      letterGrade: 'C+',
      score: '77% (C+)',
      overallComment: 'Production QA baseline feedback.',
      feedback: 'Production QA baseline feedback.',
      rubricScores: {
        clarity: { score: 4, comment: 'Clear baseline.' },
        evidence: { score: 3, comment: 'Add detail.' },
        mechanics: { score: 4, comment: 'Readable.' },
      },
    },
  });

  return {
    organizationId: org.id,
    teacherEmail: ids.teacherEmail,
    studentEmail: ids.studentEmail,
    schoolId: school.id,
    classId: klass.id,
    assignmentTypeId: assignmentType.id,
    assignmentId: assignment.id,
    classAssignmentId: classAssignment.id,
    documentId: document.id,
    submissionId: submission.id,
    password,
  };
}

export async function ensureProductionQaProfile(
  prisma: RootPrismaClient,
  password = assertProductionQaPassword(process.env.PROD_QA_PASSWORD)
): Promise<ProductionQaProfileResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(81205, hashtext(${PRODUCTION_QA_IDS.organizationId}))
      `;
      return provisionProductionQaProfile(tx, password);
    },
    { isolationLevel: 'Serializable' }
  );
}

if (import.meta.main) {
  const prisma = createPrismaClient();
  try {
    const result = await ensureProductionQaProfile(prisma);
    console.log(JSON.stringify(redactedProductionQaSummary(result), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
