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

/** Gate before performing any additional v2 usage reads. */
export async function readFreeAccountUsage(
  profile: FreeTierInappProfile & { id: string },
  freeTierRouteOpen: boolean
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
  const { limits, monthly } = await effectiveFreeTierLimits(organizationId);
  const entitlements = getEntitlementsForPlan('FREE_CLASSROOM', limits);
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
  ]);
  const reporter = policy.enabled
    ? await readMonthlyUsage(organizationId, 'reporter')
    : 0;
  return {
    ...buildFreeAccountUsage({
      monthly: policy.enabled,
      seatCap: entitlements.studentSeatCap!,
      lessonPlanCap: entitlements.features.lessonPlanQuota!,
      assignmentCaps: FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
      students: seats.currentStudents,
      pendingInvites: seats.pendingInvites,
      lessonPlans,
      assignmentCounts: Object.fromEntries(assignmentCounts),
    }),
    monthly: policy.enabled,
    ...(policy.enabled
      ? {
          renewsAt: lessonPlanMonthWindow(new Date()).lt.toISOString(),
          reporter: {
            used: reporter,
            total: limits.reporterMonthly,
            remaining: Math.max(0, limits.reporterMonthly - reporter),
          },
        }
      : {}),
    classCode: klass?.code ?? null,
    classId: klass?.id ?? null,
    checklist: {
      classReady: Boolean(klass?.code),
      assignmentCreated: [...assignmentCounts.values()].some((n) => n > 0),
      writingSubmitted: writingSubmitted > 0,
      graded: graded > 0,
    },
    gradingPause,
  };
}
