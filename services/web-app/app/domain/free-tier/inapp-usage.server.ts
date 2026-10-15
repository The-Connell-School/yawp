import { prisma } from '~/utils/db.server';
import { getFreeClassroomAssignmentQuotaUsage } from '~/utils/assignment-quota.server';
import { countFreeClassSeatUsage } from './class-seat-cap.server';
import { countOrganizationLessonPlans } from '~/utils/lesson-planner/lesson-planner-quota.server';
import {
  FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
  getEntitlements,
} from '~/utils/entitlements.server';
import { buildFreeAccountUsage, type FreeAccountUsage } from './inapp-usage';
import { readGradingLimitStatus } from '~/utils/rate-limit.server';

/** Only called after the existing account/feature/teacher gates have passed. */
export async function readFreeAccountUsage(
  organizationId: string,
  membershipId: string
): Promise<FreeAccountUsage> {
  const entitlements = getEntitlements('FREE_CLASSROOM');
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
          klass.id
        )
      : { currentStudents: 0, pendingInvites: 0 },
    getFreeClassroomAssignmentQuotaUsage(organizationId),
    countOrganizationLessonPlans(organizationId),
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
  return {
    ...buildFreeAccountUsage({
      seatCap: entitlements.studentSeatCap!,
      lessonPlanCap: entitlements.features.lessonPlanQuota!,
      assignmentCaps: FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
      students: seats.currentStudents,
      pendingInvites: seats.pendingInvites,
      lessonPlans,
      assignmentCounts: Object.fromEntries(assignmentCounts),
    }),
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
