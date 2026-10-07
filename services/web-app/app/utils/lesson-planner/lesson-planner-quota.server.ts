import { prisma } from '~/utils/db.server';
import {
  FREE_CLASSROOM_LESSON_PLAN_QUOTA,
  getEntitlements,
} from '~/utils/entitlements.server';
import type { OrganizationPlan } from '@app/prisma';

export class LessonPlanQuotaExceededError extends Error {
  readonly quota: number;

  constructor(quota: number) {
    super('Lesson plan quota exceeded');
    this.name = 'LessonPlanQuotaExceededError';
    this.quota = quota;
  }
}

export function lessonPlanQuotaMessage(quota: number): string {
  return `Your plan includes ${quota} lesson plans. You have used them all — upgrade your plan or delete a draft to plan another lesson.`;
}

export async function countOrganizationLessonPlans(
  organizationId: string
): Promise<number> {
  return prisma.lessonPlanConversation.count({
    where: { organizationId, deletedAt: null },
  });
}

export async function assertCanCreateLessonPlan({
  organizationId,
  plan,
}: {
  organizationId: string;
  plan: OrganizationPlan;
}): Promise<void> {
  const quota = getEntitlements(plan).features.lessonPlanQuota;
  if (quota === null) return;

  const count = await countOrganizationLessonPlans(organizationId);
  if (count >= quota) {
    throw new LessonPlanQuotaExceededError(quota);
  }
}

export { FREE_CLASSROOM_LESSON_PLAN_QUOTA };
