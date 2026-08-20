/* eslint-disable no-console */
import { createPrismaClient } from './local-dev/connection';
import { createPassword } from './utils';
import { getClassArtByIndex } from '../../../services/web-app/app/utils/class-art.ts';

export const PRODUCTION_QA_IDS = {
  organizationId: 'prod-qa-org',
  schoolId: 'prod-qa-school',
  schoolCode: 'PROD-QA',
  classId: 'prod-qa-class',
  classCode: 'PROD-QA-CLASS',
  teacherUserId: 'prod-qa-teacher-user',
  teacherMembershipId: 'prod-qa-teacher-membership',
  teacherEmail: 'prod.qa.teacher@brock.software',
  studentUserId: 'prod-qa-student-user',
  studentMembershipId: 'prod-qa-student-membership',
  studentEmail: 'prod.qa.student@brock.software',
  assignmentTypeId: 'prod-qa-writing-assignment-type',
  assignmentId: 'prod-qa-writing-assignment',
  classAssignmentId: 'prod-qa-class-assignment',
  documentId: 'prod-qa-student-document',
  submissionId: 'prod-qa-released-submission',
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

type PrismaClientLike = ReturnType<typeof createPrismaClient>;

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

export async function ensureProductionQaProfile(
  prisma: PrismaClientLike,
  password = assertProductionQaPassword(process.env.PROD_QA_PASSWORD)
): Promise<ProductionQaProfileResult> {
  const ids = PRODUCTION_QA_IDS;
  const classArtKey = getClassArtByIndex(0).key;

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
    'This production QA document is disposable and belongs only to prod-qa-org.';
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
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SET LOCAL yawp.submission_activity_cleanup = 'on'"
    );
    await tx.submissionActivity.deleteMany({
      where: {
        submissionId: ids.submissionId,
        organizationId: ids.organizationId,
      },
    });
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

if (import.meta.main) {
  const prisma = createPrismaClient();
  try {
    const result = await ensureProductionQaProfile(prisma);
    console.log(JSON.stringify(redactedProductionQaSummary(result), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
