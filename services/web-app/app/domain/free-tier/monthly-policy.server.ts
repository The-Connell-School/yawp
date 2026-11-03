import type { Organization, Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { effectiveFreeTierLimits } from './limits.server';
import { DEFAULT_FREE_TIER_LIMITS } from './limits';

const LESSON_PLANNER_METERING_STATUSES = [
  'APPROVED',
  'SENT',
  'MANUAL_REVIEW',
] as const;

/** P8 consumer gate. The existing I5 base/organization targeting remains authoritative. */
export async function monthlyFreeTierPolicy(
  organization: Pick<Organization, 'id' | 'plan'>,
  db: Prisma.TransactionClient = prisma
) {
  if (organization.plan !== 'FREE_CLASSROOM')
    return {
      enabled: false,
      lessonPlannerMeteringEnabled: false,
      limits: DEFAULT_FREE_TIER_LIMITS,
    };
  const { limits, monthly } = await effectiveFreeTierLimits(
    organization.id,
    db
  );
  if (!monthly)
    return { enabled: false, lessonPlannerMeteringEnabled: false, limits };
  try {
    const application = await db.freeTierApplication.findFirst({
      where: {
        organizationId: organization.id,
        status: { in: [...LESSON_PLANNER_METERING_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    const lessonPlannerMeteringEnabled = Boolean(application);
    return {
      enabled: application?.status === 'APPROVED',
      lessonPlannerMeteringEnabled,
      limits,
    };
  } catch {
    return {
      enabled: false,
      lessonPlannerMeteringEnabled: false,
      limits,
      meteringLookupFailed: true as const,
    };
  }
}
