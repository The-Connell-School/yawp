import { createHash } from 'node:crypto';
import type { OrganizationPlan } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  FREE_CLASSROOM_STUDENT_SEAT_CAP,
  FREE_CLASSROOM_TEACHER_SEAT_CAP,
} from '~/utils/entitlements.server';
import { FREE_CLASSROOM_ASSIGNMENT_KINDS } from '~/utils/entitlements.server';
import { isConsumerEmailDomain } from '~/domain/free-tier/consumer-email-domains';
import { currentSchoolYear } from '~/utils/school-year';
import { generateClassCode } from '~/utils/class';

export type ProvisionFreeClassroomResult =
  | { status: 'provisioned'; organizationId: string }
  | { status: 'already_provisioned'; organizationId: string }
  | { status: 'pending_user' }
  | { status: 'routed_to_school_onboarding' };

function emailDomain(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

type SchoolDomainLookupClient = Pick<typeof prisma, '$queryRaw'>;

export async function teacherEmailDomainMatchesSchoolOrg(
  domain: string,
  client: SchoolDomainLookupClient = prisma
) {
  if (!domain) return false;
  const rows = await client.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "OrgMembership" om
      JOIN "User" u ON u.id = om."userId"
      JOIN "Organization" o ON o.id = om."organizationId"
      WHERE om.role = 'TEACHER'
        AND o.plan = 'SCHOOL'::"OrganizationPlan"
        AND lower(split_part(u.email, '@', 2)) = ${domain}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

function schoolCodeFromName(schoolName: string, applicationId: string) {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const suffix = createHash('sha256')
    .update(applicationId)
    .digest('hex')
    .slice(0, 6);
  return `free-${slug || 'class'}-${suffix}`.slice(0, 40);
}

async function linkBundleAssignmentTypes(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  organizationId: string
) {
  const types = await tx.assignmentType.findMany({
    where: { kind: { in: [...FREE_CLASSROOM_ASSIGNMENT_KINDS] } },
    select: { id: true, kind: true },
  });
  if (types.length !== FREE_CLASSROOM_ASSIGNMENT_KINDS.length) {
    throw new Error('free_classroom_bundle_types_missing');
  }
  for (const type of types) {
    await tx.organizationAssignmentType.upsert({
      where: {
        organizationId_assignmentTypeId: {
          organizationId,
          assignmentTypeId: type.id,
        },
      },
      create: { organizationId, assignmentTypeId: type.id },
      update: {},
    });
  }
  return types;
}

export async function provisionFreeClassroom(
  applicationId: string
): Promise<ProvisionFreeClassroomResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_provision:' || ${applicationId}))`;

    const application = await tx.freeTierApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        email: true,
        schoolName: true,
        userId: true,
        organizationId: true,
      },
    });
    if (!application) {
      throw new Error('free_tier_application_not_found');
    }

    if (application.organizationId) {
      return {
        status: 'already_provisioned',
        organizationId: application.organizationId,
      };
    }

    if (!application.userId) {
      return { status: 'pending_user' };
    }

    const domain = emailDomain(application.email);
    if (
      domain &&
      !isConsumerEmailDomain(domain) &&
      (await teacherEmailDomainMatchesSchoolOrg(domain))
    ) {
      return { status: 'routed_to_school_onboarding' };
    }

    const existingSchoolMembership = await tx.orgMembership.findFirst({
      where: {
        userId: application.userId,
        organization: { plan: 'SCHOOL', id: { not: 'default-org' } },
      },
      select: { id: true },
    });
    if (existingSchoolMembership) {
      return { status: 'routed_to_school_onboarding' };
    }

    const now = new Date();
    const org = await tx.organization.create({
      data: {
        name: application.schoolName.trim() || 'Free Classroom',
        plan: 'FREE_CLASSROOM' satisfies OrganizationPlan,
        planActivatedAt: now,
        numOfStudentSeats: FREE_CLASSROOM_STUDENT_SEAT_CAP,
        numOfTeacherSeats: FREE_CLASSROOM_TEACHER_SEAT_CAP,
        reporterEnabled: false,
        classInsightsEnabled: true,
        revisionFlowEnabled: true,
      },
      select: { id: true },
    });

    const schoolCode = schoolCodeFromName(application.schoolName, application.id);
    const school = await tx.school.create({
      data: {
        organizationId: org.id,
        name: application.schoolName,
        code: schoolCode,
      },
      select: { id: true },
    });

    const membership = await tx.orgMembership.create({
      data: {
        userId: application.userId,
        organizationId: org.id,
        role: 'TEACHER',
        isOrgOwner: true,
        schools: { connect: { id: school.id } },
      },
      select: { id: true },
    });

    await tx.class.create({
      data: {
        schoolId: school.id,
        schoolYear: currentSchoolYear(),
        title: 'My Class',
        code: generateClassCode(),
        teachers: { connect: { id: membership.id } },
      },
    });

    await linkBundleAssignmentTypes(tx, org.id);

    await tx.freeTierApplication.update({
      where: { id: application.id },
      data: { organizationId: org.id },
    });

    return { status: 'provisioned', organizationId: org.id };
  });
}

/** Free Tier C calls this after the teacher account exists. */
export async function retryFreeClassroomProvisioningForUser(userId: string) {
  const application = await prisma.freeTierApplication.findFirst({
    where: { userId, organizationId: null, status: 'APPROVED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  if (!application) return null;
  return provisionFreeClassroom(application.id);
}

export async function provisionFreeClassroomFromApproval(applicationId: string) {
  const result = await provisionFreeClassroom(applicationId);
  if (result.status === 'routed_to_school_onboarding') {
    console.info('free_tier_provision_routed_to_school', { applicationId });
  }
  if (result.status === 'pending_user') {
    console.info('free_tier_provision_pending_user', { applicationId });
  }
  return result;
}
