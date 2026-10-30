import { lessonPlanMonthWindow } from '~/utils/lesson-planner/month-window';
import { monthlyFreeTierPolicy } from './monthly-policy.server';
import { readMonthlyUsage } from './monthly-operations.server';
import {
  isFreeTierInappV2Enabled,
  type FreeTierInappProfile,
} from './inapp-feature-gate.server';
import { prisma } from '~/utils/db.server';
import { getFreeClassroomAssignmentQuotaUsage } from '~/utils/assignment-quota.server';
import { countFreeClassSeatUsage } from './class-seat-cap.server';
import { countOrganizationLessonPlans } from '~/utils/lesson-planner/lesson-planner-quota.server';
import {
  FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
  getEntitlementsForPlan,
} from '~/utils/entitlements.server';
import { effectiveFreeTierLimits } from './limits.server';
import { buildFreeAccountUsage, type FreeAccountUsage } from './inapp-usage';
import { readGradingLimitStatus } from '~/utils/rate-limit.server';
import { shouldHideFreeTierTeachingSecrets } from './locked-preview.server';

/** Gate before performing any additional v2 usage reads. */
export async function readFreeAccountUsage(
  profile: FreeTierInappProfile & { id: string },
  freeTierRouteOpen: boolean,
  userId: string
): Promise<FreeAccountUsage | null> {
  if (
    !freeTierRouteOpen ||
    profile.role !== 'TEACHER' ||
    profile.organization.plan !== 'FREE_CLASSROOM'
  )
    return null;
  const policy = await monthlyFreeTierPolicy(
    profile.organization as Parameters<typeof monthlyFreeTierPolicy>[0]
  );
  if (
    !policy.enabled &&
    !(await isFreeTierInappV2Enabled(profile, freeTierRouteOpen))
  )
    return null;
  const organizationId = profile.organization.id;
  const membershipId = profile.id;
  const hideTeachingSecrets = await shouldHideFreeTierTeachingSecrets(userId);
  const { limits, monthly } = await effectiveFreeTierLimits(organizationId);
  const shellMonthly = policy.enabled;
  const lessonPlannerMonthlyMetering = policy.lessonPlannerMeteringEnabled;
  const entitlements = getEntitlementsForPlan('FREE_CLASSROOM', limits);
  const lessonPlanCap = entitlements.features.lessonPlanQuota!;
  const klass = await prisma.class.findFirst({
    where: {
      isArchived: false,
      school: { organizationId },
      teachers: { some: { id: membershipId } },
    },
    select: { id: true, code: true },
    orderBy: { createdAt: 'asc' },
  });
  const [
    seats,
    assignmentCounts,
    lessonPlans,
    writingSubmitted,
    graded,
    gradingPause,
    monthlyLessonPlansUsed,
  ] = await Promise.all([
    klass
      ? countFreeClassSeatUsage(
          prisma as Parameters<typeof countFreeClassSeatUsage>[0],
          klass.id,
          monthly
        )
      : { currentStudents: 0, pendingInvites: 0 },
    getFreeClassroomAssignmentQuotaUsage(organizationId),
    countOrganizationLessonPlans(organizationId, monthly),
    klass
      ? prisma.document.count({
          where: {
            classAssignment: { classId: klass.id },
            submissions: { some: { unsubmittedAt: null } },
          },
        })
      : 0,
    klass
      ? prisma.document.count({
          where: {
            classAssignment: { classId: klass.id },
            submissions: {
              some: { unsubmittedAt: null, gradedAt: { not: null } },
            },
          },
        })
      : 0,
    readGradingLimitStatus(membershipId),
    lessonPlannerMonthlyMetering
      ? countOrganizationLessonPlans(organizationId, true)
      : Promise.resolve(null),
  ]);
  const reporterUsed = policy.enabled
    ? await readMonthlyUsage(organizationId, 'reporter')
    : 0;
  const usageCounts = buildFreeAccountUsage({
    monthly: shellMonthly,
    seatCap: entitlements.studentSeatCap!,
    lessonPlanCap,
    assignmentCaps: FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
    students: seats.currentStudents,
    pendingInvites: seats.pendingInvites,
    lessonPlans,
    assignmentCounts: Object.fromEntries(assignmentCounts),
  });
  const lessonPlannerMonthly =
    monthlyLessonPlansUsed === null
      ? undefined
      : {
          used: monthlyLessonPlansUsed,
          total: lessonPlanCap,
          remaining: Math.max(0, lessonPlanCap - monthlyLessonPlansUsed),
        };
  return {
    ...usageCounts,
    monthly: shellMonthly,
    usageNavMetersAvailable: false,
    lessonPlannerMonthlyMetering,
    unlimitedFreeAssignmentTiles: lessonPlannerMonthlyMetering,
    reporterLocked: lessonPlannerMonthlyMetering && !policy.enabled,
    ...(lessonPlannerMonthly ? { lessonPlannerMonthly } : {}),
    ...(shellMonthly
      ? {
          renewsAt: lessonPlanMonthWindow(new Date()).lt.toISOString(),
          reporter: {
            used: reporterUsed,
            total: limits.reporterMonthly,
            remaining: Math.max(0, limits.reporterMonthly - reporterUsed),
          },
        }
      : lessonPlannerMonthlyMetering
        ? {
            renewsAt: lessonPlanMonthWindow(new Date()).lt.toISOString(),
          }
        : {}),
    classCode: hideTeachingSecrets ? null : (klass?.code ?? null),
    classCodeHidden: hideTeachingSecrets,
    classId: klass?.id ?? null,
    checklist: {
      classReady: Boolean(klass?.id),
      assignmentCreated: [...assignmentCounts.values()].some((n) => n > 0),
      writingSubmitted: writingSubmitted > 0,
      graded: graded > 0,
    },
    gradingPause,
  };
}
