import type { E2EPrismaClient } from './prisma-client';
import { generateTOTP } from '../app/utils/totp.server';

const DOCUMENT_SUBMISSION_FLAG = 'document_submission_enabled';
const DOCUMENT_SUBMISSION_SCHOOL_IDS =
  'document_submission_enabled_school_ids';
const ASSIGNMENTS_ENABLED_ORG_IDS = 'assignments_enabled_org_ids';
const RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS =
  'released_grades_organization_enabled_org_ids';
const CLASS_INSIGHTS_ENABLED_ORG_IDS = 'class_insights_enabled_org_ids';

function parseIdList(value: string | null | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export async function setDocumentSubmissionForSchool(params: {
  prisma: E2EPrismaClient;
  schoolId: string;
  enabled: boolean;
}) {
  const { prisma, schoolId, enabled } = params;
  await prisma.setting.upsert({
    where: { name: DOCUMENT_SUBMISSION_FLAG },
    create: {
      name: DOCUMENT_SUBMISSION_FLAG,
      description: 'Allow students to submit documents for grading',
      value: 'false',
      valueType: 'boolean',
    },
    update: {
      value: 'false',
      valueType: 'boolean',
    },
  });

  const existingSchoolIds = await prisma.setting.findUnique({
    where: { name: DOCUMENT_SUBMISSION_SCHOOL_IDS },
    select: { value: true },
  });
  const schoolIds = parseIdList(existingSchoolIds?.value);

  if (enabled) {
    schoolIds.add(schoolId);
  } else {
    schoolIds.delete(schoolId);
  }

  await prisma.setting.upsert({
    where: { name: DOCUMENT_SUBMISSION_SCHOOL_IDS },
    create: {
      name: DOCUMENT_SUBMISSION_SCHOOL_IDS,
      description:
        'Comma-separated school IDs allowed to use document submission and grading',
      value: Array.from(schoolIds).join(','),
      valueType: 'string',
    },
    update: {
      value: Array.from(schoolIds).join(','),
      valueType: 'string',
    },
  });
}

export async function setAssignmentsForOrganization(params: {
  prisma: E2EPrismaClient;
  organizationId: string;
  enabled: boolean;
}) {
  const { prisma, organizationId, enabled } = params;
  const existing = await prisma.setting.findUnique({
    where: { name: ASSIGNMENTS_ENABLED_ORG_IDS },
    select: { value: true },
  });
  const orgIds = parseIdList(existing?.value);
  if (enabled) {
    orgIds.add(organizationId);
  } else {
    orgIds.delete(organizationId);
  }
  await prisma.setting.upsert({
    where: { name: ASSIGNMENTS_ENABLED_ORG_IDS },
    create: {
      name: ASSIGNMENTS_ENABLED_ORG_IDS,
      description: 'Organization IDs allowed to use assignments',
      value: Array.from(orgIds).join(','),
      valueType: 'string',
    },
    update: {
      value: Array.from(orgIds).join(','),
      valueType: 'string',
    },
  });
}

export async function setReleasedGradesOrganizationForOrganization(params: {
  prisma: E2EPrismaClient;
  organizationId: string;
  enabled: boolean;
}) {
  const { prisma, organizationId, enabled } = params;
  const existing = await prisma.setting.findUnique({
    where: { name: RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS },
    select: { value: true },
  });
  const orgIds = parseIdList(existing?.value);
  if (enabled) {
    orgIds.add(organizationId);
  } else {
    orgIds.delete(organizationId);
  }
  await prisma.setting.upsert({
    where: { name: RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS },
    create: {
      name: RELEASED_GRADES_ORGANIZATION_ENABLED_ORG_IDS,
      description:
        'Organization IDs allowed to use the released-grades organization view',
      value: Array.from(orgIds).join(','),
      valueType: 'string',
    },
    update: {
      value: Array.from(orgIds).join(','),
      valueType: 'string',
    },
  });
}

export async function setClassInsightsForOrganization(params: {
  prisma: E2EPrismaClient;
  organizationId: string;
  enabled: boolean;
}) {
  const { prisma, organizationId, enabled } = params;
  const existing = await prisma.setting.findUnique({
    where: { name: CLASS_INSIGHTS_ENABLED_ORG_IDS },
    select: { value: true },
  });
  const orgIds = parseIdList(existing?.value);
  if (enabled) {
    orgIds.add(organizationId);
  } else {
    orgIds.delete(organizationId);
  }
  await prisma.setting.upsert({
    where: { name: CLASS_INSIGHTS_ENABLED_ORG_IDS },
    create: {
      name: CLASS_INSIGHTS_ENABLED_ORG_IDS,
      description:
        'Organization IDs allowed to generate class-level AI insights on graded assignments',
      value: Array.from(orgIds).join(','),
      valueType: 'string',
    },
    update: {
      value: Array.from(orgIds).join(','),
      valueType: 'string',
    },
  });
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
  // Delete all submissions to "unsubmit" the document
  await prisma.submission.deleteMany({
    where: { documentId },
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
      profiles: {
        select: {
          teacherProfile: { select: { id: true } },
        },
      },
    },
  });

  const teacherProfileId = teacher?.profiles.find(
    (profile) => profile.teacherProfile?.id
  )?.teacherProfile?.id;

  if (!teacherProfileId) {
    throw new Error(`Teacher profile not found for ${teacherEmail}`);
  }

  await prisma.class.update({
    where: { id: classId },
    data: {
      teachers: { connect: { id: teacherProfileId } },
    },
  });

  return teacherProfileId;
}
