import { resolveClassCode } from '~/utils/class-code-write.server';
import {
  runFreeTierAnalytics,
  acquisitionChannel,
  captureFreeTierAnalyticsEvent,
  freeTierApplicationDistinctId,
  freeTierOrganizationDistinctId,
  FREE_TIER_ANALYTICS_EVENTS,
} from './posthog-analytics.server';
import { isClassPreparationEnabled } from './class-preparation.server';
import { parseClassPreparation } from './class-preparation';
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
import { generateClassCardGradientKey } from '~/utils/class-card-gradient';
import { pickClassArtKeyForOrganization } from '~/utils/class-art-assignment.server';

export type ProvisionFreeClassroomResult =
  | { status: 'provisioned'; organizationId: string }
  | { status: 'already_provisioned'; organizationId: string }
  | { status: 'pending_user' }
  | { status: 'routed_to_school_onboarding' };

export type ProvisionFreeClassroomOptions = {
  /**
   * Staff approval is an explicit decision. Provision the free classroom even
   * when the teacher's domain matches a paid school, and record that match
   * for internal follow-up. Never joins the paid school.
   */
  alwaysProvision?: boolean;
};

export type PaidSchoolMatch = { id: string; name: string };

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

/** Paid school orgs that already have a teacher on this email domain. */
export async function paidSchoolOrgsForTeacherDomain(
  domain: string,
  client: SchoolDomainLookupClient = prisma
): Promise<PaidSchoolMatch[]> {
  if (!domain || isConsumerEmailDomain(domain)) return [];
  const rows = await client.$queryRaw<PaidSchoolMatch[]>`
    SELECT DISTINCT o.id, o.name
    FROM "OrgMembership" om
    JOIN "User" u ON u.id = om."userId"
    JOIN "Organization" o ON o.id = om."organizationId"
    WHERE om.role = 'TEACHER'
      AND o.plan = 'SCHOOL'::"OrganizationPlan"
      AND lower(split_part(u.email, '@', 2)) = ${domain}
    ORDER BY o.name
  `;
  return rows;
}

/** Internal note. Idempotent: the same sentence is not appended twice. */
export function paidSchoolDomainMatchNote(matches: PaidSchoolMatch[]) {
  const schools = matches
    .map((match) => ({ id: match.id, name: match.name.trim() }))
    .filter((match) => match.name);
  if (!schools.length) return null;
  const label = (school: { name: string }) => school.name;
  if (schools.length === 1) {
    return `Teacher's domain matches paid school ${label(schools[0]!)}.`;
  }
  if (schools.length === 2) {
    return `Teacher's domain matches paid schools ${label(schools[0]!)} and ${label(schools[1]!)}.`;
  }
  const names = schools.map(label);
  return `Teacher's domain matches paid schools ${names.slice(0, -1).join(', ')}, and ${names.at(-1)}.`;
}

export function appendPaidSchoolDomainNote(
  notes: string | null | undefined,
  signal: string | null
) {
  if (!signal) return notes ?? null;
  if (notes?.includes(signal)) return notes;
  const current = notes?.trim();
  return current ? `${current}\n${signal}` : signal;
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

type StarterClassApplication = {
  userId: string;
  organizationId: string | null;
  starterClassName: string | null;
  starterClassGrade: string | null;
};

async function createStarterClass(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  args: {
    organizationId: string;
    schoolId: string;
    membershipId: string;
    application: StarterClassApplication;
    alwaysProvision: boolean;
  }
) {
  const prepared = parseClassPreparation(
    args.application.starterClassName ?? '',
    args.application.starterClassGrade ?? ''
  );
  const usePrepared =
    prepared.ok &&
    (args.alwaysProvision ||
      (await isClassPreparationEnabled(
        args.application.userId,
        args.application.organizationId
      )));
  const classCode = await resolveClassCode(tx, generateClassCode(), {
    generated: true,
  });
  const classArtKey = await pickClassArtKeyForOrganization(args.organizationId);
  await tx.class.create({
    data: {
      schoolId: args.schoolId,
      schoolYear: currentSchoolYear(),
      title: usePrepared && prepared.ok ? prepared.className : 'My Class',
      ...(usePrepared && prepared.ok ? { grade: prepared.grade } : {}),
      code: classCode,
      cardGradientKey: generateClassCardGradientKey(classCode),
      classArtKey,
      teachers: { connect: { id: args.membershipId } },
    },
  });
}

async function ensureFreeTeacherClassroom(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  application: StarterClassApplication & {
    id: string;
    schoolName: string;
    organizationId: string;
  }
) {
  let school = await tx.school.findFirst({
    where: { organizationId: application.organizationId },
    select: { id: true },
  });
  if (!school) {
    school = await tx.school.create({
      data: {
        organizationId: application.organizationId,
        name: application.schoolName,
        code: schoolCodeFromName(application.schoolName, application.id),
      },
      select: { id: true },
    });
  }
  let membership = await tx.orgMembership.findFirst({
    where: {
      userId: application.userId,
      organizationId: application.organizationId,
      role: 'TEACHER',
    },
    select: { id: true },
  });
  if (!membership) {
    membership = await tx.orgMembership.create({
      data: {
        userId: application.userId,
        organizationId: application.organizationId,
        role: 'TEACHER',
        isOrgOwner: true,
        schools: { connect: { id: school.id } },
      },
      select: { id: true },
    });
  }
  const existingClass = await tx.class.findFirst({
    where: {
      isArchived: false,
      teachers: { some: { id: membership.id } },
    },
    select: { id: true },
  });
  if (existingClass) return;
  await createStarterClass(tx, {
    organizationId: application.organizationId,
    schoolId: school.id,
    membershipId: membership.id,
    application,
    alwaysProvision: true,
  });
}

export async function provisionFreeClassroom(
  applicationId: string,
  options: ProvisionFreeClassroomOptions = {}
): Promise<ProvisionFreeClassroomResult> {
  const result = await prisma.$transaction(async (tx): Promise<ProvisionFreeClassroomResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_provision:' || ${applicationId}))`;

    const application = await tx.freeTierApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        email: true,
        schoolName: true,
        starterClassName: true,
        starterClassGrade: true,
        notes: true,
        userId: true,
        organizationId: true,
      },
    });
    if (!application) {
      throw new Error('free_tier_application_not_found');
    }

    if (application.organizationId) {
      if (options.alwaysProvision && application.userId) {
        const domain = emailDomain(application.email);
        const domainNote = paidSchoolDomainMatchNote(
          domain ? await paidSchoolOrgsForTeacherDomain(domain, tx) : []
        );
        if (domainNote && !application.notes?.includes(domainNote)) {
          await tx.freeTierApplication.update({
            where: { id: application.id },
            data: {
              notes: appendPaidSchoolDomainNote(application.notes, domainNote),
            },
          });
        }
        await ensureFreeTeacherClassroom(tx, {
          ...application,
          userId: application.userId,
          organizationId: application.organizationId,
        });
      }
      return {
        status: 'already_provisioned',
        organizationId: application.organizationId,
      };
    }

    if (!application.userId) {
      return { status: 'pending_user' };
    }

    const domain = emailDomain(application.email);
    const domainMatches =
      options.alwaysProvision && domain
        ? await paidSchoolOrgsForTeacherDomain(domain, tx)
        : [];
    const domainNote = paidSchoolDomainMatchNote(domainMatches);
    if (!options.alwaysProvision) {
      if (
        domain &&
        !isConsumerEmailDomain(domain) &&
        (await teacherEmailDomainMatchesSchoolOrg(domain, tx))
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
    } else if (domainNote && !application.notes?.includes(domainNote)) {
      await tx.freeTierApplication.update({
        where: { id: application.id },
        data: { notes: appendPaidSchoolDomainNote(application.notes, domainNote) },
      });
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

    await createStarterClass(tx, {
      organizationId: org.id,
      schoolId: school.id,
      membershipId: membership.id,
      application: {
        userId: application.userId,
        organizationId: application.organizationId,
        starterClassName: application.starterClassName,
        starterClassGrade: application.starterClassGrade,
      },
      alwaysProvision: Boolean(options.alwaysProvision),
    });

    await linkBundleAssignmentTypes(tx, org.id);

    await tx.freeTierApplication.update({
      where: { id: application.id },
      data: { organizationId: org.id },
    });

    return { status: 'provisioned', organizationId: org.id };
  });
  if (result.status === 'provisioned') {
    await runFreeTierAnalytics(async () => {
      const application = await prisma.freeTierApplication.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          status: true,
          userId: true,
          organizationId: true,
          acquisitionTokenId: true,
          acquisitionToken: {
            select: {
              label: true,
              sourceName: true,
              eventLocation: true,
              eventDate: true,
              bypassWaitlist: true,
            },
          },
        },
      });
      if (application?.organizationId) {
        captureFreeTierAnalyticsEvent({
          event: FREE_TIER_ANALYTICS_EVENTS.activation,
          distinctId: freeTierOrganizationDistinctId(application.organizationId),
          aliases: [freeTierApplicationDistinctId(application.id)],
          properties: {
            application_id: application.id,
            application_status: application.status,
            teacher_user_id: application.userId,
            organization_id: application.organizationId,
            activation_step: result.status,
            acquisition_token_id: application.acquisitionTokenId,
            acquisition_channel: acquisitionChannel({
              acquisitionTokenId: application.acquisitionTokenId,
              sourceName: application.acquisitionToken?.sourceName,
            }),
            token_label: application.acquisitionToken?.label ?? null,
            source_name: application.acquisitionToken?.sourceName ?? null,
            event_location: application.acquisitionToken?.eventLocation ?? null,
            event_date:
              application.acquisitionToken?.eventDate?.toISOString() ?? null,
            bypass_waitlist: application.acquisitionToken?.bypassWaitlist ?? null,
          },
        });
      }
    });
  }

  return result;
}

/** Free Tier C calls this after the teacher account exists. */
export async function retryFreeClassroomProvisioningForUser(userId: string) {
  const application = await prisma.freeTierApplication.findFirst({
    where: { userId, organizationId: null, status: 'APPROVED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  if (!application) return null;
  return provisionFreeClassroom(application.id, { alwaysProvision: true });
}

export async function provisionFreeClassroomFromApproval(applicationId: string) {
  const result = await provisionFreeClassroom(applicationId, {
    alwaysProvision: true,
  });
  if (result.status === 'routed_to_school_onboarding') {
    console.info('free_tier_provision_routed_to_school', { applicationId });
  }
  if (result.status === 'pending_user') {
    console.info('free_tier_provision_pending_user', { applicationId });
  }
  return result;
}
