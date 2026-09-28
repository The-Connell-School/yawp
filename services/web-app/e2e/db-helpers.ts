import type { E2EPrismaClient } from './prisma-client';
import { currentSchoolYear } from '../app/utils/school-year';
import { generateTOTP } from '../app/utils/totp.server';
import bcrypt from 'bcryptjs';

function createPassword(password: string) {
  return {
    hash: bcrypt.hashSync(password, 10),
  };
}

export async function createDeployedAssignment(params: {
  prisma: E2EPrismaClient;
  classId: string;
  assignmentTypeId: string;
  title?: string | null;
  prompt: string;
  submitForGrade?: boolean;
  pointValue?: number | null;
  rubricTotalPoints?: number | null;
  gradingMode?: 'step' | 'bands';
  /** Omit for the product default (tutor on); false seeds a cold write. */
  tutorEnabled?: boolean;
}) {
  const assignment = await params.prisma.assignment.create({
    data: {
      assignmentTypeId: params.assignmentTypeId,
      title: params.title ?? null,
      prompt: params.prompt,
      ...(params.submitForGrade !== undefined
        ? { submitForGrade: params.submitForGrade }
        : {}),
      ...(params.tutorEnabled !== undefined
        ? { tutorEnabled: params.tutorEnabled }
        : {}),
      ...(params.pointValue !== undefined
        ? { pointValue: params.pointValue }
        : {}),
      ...(params.rubricTotalPoints !== undefined
        ? { rubricTotalPoints: params.rubricTotalPoints }
        : {}),
      ...(params.gradingMode !== undefined
        ? { gradingMode: params.gradingMode }
        : {}),
    },
  });
  const classAssignment = await params.prisma.classAssignment.create({
    data: {
      assignmentId: assignment.id,
      classId: params.classId,
    },
  });
  return { assignment, classAssignment };
}

export async function invalidateUserSessions(params: {
  prisma: E2EPrismaClient;
  userId: string;
}) {
  const { prisma, userId } = params;
  await prisma.session.deleteMany({
    where: { userId },
  });
}

export async function ensureDocumentSubmitted(params: {
  prisma: E2EPrismaClient;
  documentId: string;
}) {
  const { prisma, documentId } = params;
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      html: true,
      text: true,
      title: true,
      submissions: {
        take: 1,
        orderBy: { submittedAt: 'desc' },
        select: { id: true },
      },
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (document.submissions.length > 0) {
    return document.submissions[0].id;
  }

  if (!document.html || !document.text) {
    throw new Error(`Document ${documentId} is missing html/text content.`);
  }

  const now = new Date();
  const submission = await prisma.submission.create({
    data: {
      documentId: document.id,
      title: document.title ?? '',
      html: document.html,
      text: document.text,
      submittedAt: now,
    },
    select: { id: true },
  });

  await prisma.documentComment.updateMany({
    where: { documentId: document.id, archivedAt: null },
    data: { archivedAt: now },
  });

  return submission.id;
}

export async function ensureDocumentUnsubmitted(params: {
  prisma: E2EPrismaClient;
  documentId: string;
}) {
  const { prisma, documentId } = params;
  // Fixture cleanup may remove its own audit rows. Production flows retain them.
  await prisma.$transaction(async (tx) => {
    await tx.submissionActivity.deleteMany({
      where: { submission: { documentId } },
    });
    await tx.submission.deleteMany({
      where: { documentId },
    });
  });
}

export async function createTeacherInvitation(params: {
  prisma: E2EPrismaClient;
  email: string;
  organizationId: string;
}) {
  const { prisma, email, organizationId } = params;
  await prisma.invitation.deleteMany({
    where: {
      type: 'onboard-teacher',
      target: email,
    },
  });

  const { otp, ...verificationConfig } = await generateTOTP({
    algorithm: 'SHA-256',
    charSet: 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',
    period: 3 * 24 * 60 * 60,
  });

  await prisma.invitation.create({
    data: {
      type: 'onboard-teacher',
      target: email,
      ...verificationConfig,
      expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
      metadata: JSON.stringify({ organizationId }),
      organizationId,
    },
  });

  return { otp };
}

export async function assignTeacherToClass(params: {
  prisma: E2EPrismaClient;
  teacherEmail: string;
  classId: string;
}) {
  const { prisma, teacherEmail, classId } = params;
  const teacher = await prisma.user.findUnique({
    where: { email: teacherEmail },
    select: {
      memberships: {
        where: { role: 'TEACHER' },
        select: { id: true },
      },
    },
  });

  const teacherMembershipId = teacher?.memberships[0]?.id;

  if (!teacherMembershipId) {
    throw new Error(`Teacher membership not found for ${teacherEmail}`);
  }

  await prisma.class.update({
    where: { id: classId },
    data: {
      teachers: { connect: { id: teacherMembershipId } },
    },
  });

  return teacherMembershipId;
}

export async function createTeacherClassPilotFixture(params: {
  prisma: E2EPrismaClient;
  organizationId: string;
  schoolId: string;
  assignmentTypeId: string;
  suffix: string;
}) {
  const { prisma, organizationId, schoolId, assignmentTypeId, suffix } = params;
  const normalizedSuffix = suffix.replace(/[^a-zA-Z0-9-]/g, '-');
  const teacherPassword = 'teacher-e2e-password';
  const studentPassword = 'student-e2e-password';
  const teacherEmail = `teacher-${normalizedSuffix}@yawp.test`;
  const studentEmail = `student-${normalizedSuffix}@yawp.test`;

  const teacher = await prisma.user.create({
    data: {
      email: teacherEmail,
      name: `Teacher ${normalizedSuffix}`,
      password: { create: createPassword(teacherPassword) },
      memberships: {
        create: {
          organizationId,
          isOrgOwner: false,
          role: 'TEACHER',
        },
      },
    },
    include: { memberships: true },
  });
  const teacherMembershipId = teacher.memberships[0]?.id;
  if (!teacherMembershipId) {
    throw new Error(`Teacher membership not created for ${teacherEmail}`);
  }

  await prisma.$executeRaw`
    INSERT INTO "_SchoolTeachers" ("A", "B")
    VALUES (${teacherMembershipId}, ${schoolId})
    ON CONFLICT DO NOTHING
  `;

  const klass = await prisma.class.create({
    data: {
      code: `E2E-${normalizedSuffix}`.slice(0, 32),
      schoolYear: currentSchoolYear(),
      period: '2nd',
      grade: '10th',
      title: `Non-pilot ${normalizedSuffix}`,
      schoolId,
      teachers: { connect: { id: teacherMembershipId } },
    },
    select: { id: true },
  });

  const student = await prisma.user.create({
    data: {
      email: studentEmail,
      name: `Student ${normalizedSuffix}`,
      password: { create: createPassword(studentPassword) },
      memberships: {
        create: {
          organizationId,
          isOrgOwner: false,
          role: 'STUDENT',
          classesAsStudent: { connect: { id: klass.id } },
        },
      },
    },
    include: { memberships: true },
  });
  const studentMembershipId = student.memberships[0]?.id;
  if (!studentMembershipId) {
    throw new Error(`Student membership not created for ${studentEmail}`);
  }

  const { assignment, classAssignment } = await createDeployedAssignment({
    prisma,
    classId: klass.id,
    assignmentTypeId,
    title: `Non-pilot assignment ${normalizedSuffix}`,
    prompt: 'This assignment should not be available without pilot access.',
  });

  const documentText = `Non-pilot submitted essay ${normalizedSuffix}. This text is long enough to submit.`;
  const document = await prisma.document.create({
    data: {
      title: `Non-pilot document ${normalizedSuffix}`,
      text: documentText,
      html: `<p>${documentText}</p>`,
      membershipId: studentMembershipId,
      assignmentTypeId,
      assignmentId: assignment.id,
      classAssignmentId: classAssignment.id,
    },
    select: { id: true },
  });

  const assignmentModules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId },
    select: { id: true, position: true },
    orderBy: { position: 'asc' },
  });

  await prisma.assignmentModuleSession.createMany({
    data: assignmentModules.map((module) => ({
      assignmentModuleId: module.id,
      documentId: document.id,
      title: `Non-pilot module ${module.position}`,
      instructionsCompleted: 0,
    })),
  });

  const submission = await prisma.submission.create({
    data: {
      documentId: document.id,
      html: `<p>${documentText}</p>`,
      text: documentText,
      title: `Non-pilot submission ${normalizedSuffix}`,
      submittedAt: new Date(),
    },
    select: { id: true },
  });

  return {
    teacherEmail,
    teacherPassword,
    teacherMembershipId,
    teacherUserId: teacher.id,
    studentEmail,
    studentPassword,
    studentUserId: student.id,
    studentMembershipId,
    classId: klass.id,
    assignmentId: assignment.id,
    documentId: document.id,
    submissionId: submission.id,
  };
}
