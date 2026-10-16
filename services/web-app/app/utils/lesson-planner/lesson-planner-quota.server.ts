import { prisma } from '~/utils/db.server';
import {
  FREE_CLASSROOM_LESSON_PLAN_QUOTA,
  getEntitlementsForPlan,
} from '~/utils/entitlements.server';
import type { OrganizationPlan } from '@app/prisma';
import { effectiveFreeTierLimits } from '~/domain/free-tier/limits.server';

export class LessonPlanQuotaExceededError extends Error {
  readonly quota: number;

  constructor(quota: number, readonly monthly = false) {
    super('Lesson plan quota exceeded');
    this.name = 'LessonPlanQuotaExceededError';
    this.quota = quota;
  }
}

export function lessonPlanQuotaMessage(quota: number, monthly = false): string {
  if (monthly) return `Your plan includes ${quota} lesson plans this month. You have used them all — upgrade your plan or wait until next month to plan another lesson.`;
  return `Your plan includes ${quota} lesson plans. You have used them all — upgrade your plan or delete a draft to plan another lesson.`;
}

export async function countOrganizationLessonPlans(
  organizationId: string,
  monthly = false,
  now = new Date()
): Promise<number> {
  return prisma.lessonPlanConversation.count({
    where: { organizationId, ...(monthly ? { createdAt: lessonPlanMonthWindow(now) } : { deletedAt: null }) },
  });
}

export async function assertCanCreateLessonPlan({
  organizationId,
  plan,
}: {
  organizationId: string;
  plan: OrganizationPlan;
}): Promise<void> {
  if (plan !== 'FREE_CLASSROOM') return;
  const { limits, monthly } = await effectiveFreeTierLimits(organizationId);
  const quota = getEntitlementsForPlan(plan, limits).features.lessonPlanQuota!;

  const count = await countOrganizationLessonPlans(organizationId, monthly);
  if (count >= quota) {
    throw new LessonPlanQuotaExceededError(quota, monthly);
  }
}

export { FREE_CLASSROOM_LESSON_PLAN_QUOTA };

/** Organizations currently have no stored timezone; UTC is the calendar-month fallback. */
export function lessonPlanMonthWindow(now: Date) {
  return {
    gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
