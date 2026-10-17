import { prisma } from '~/utils/db.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { FREE_TIER_ONBOARDING_V2_FLAG } from '~/domain/feature-flags/feature-flags';
import { parseClassPreparation } from './class-preparation';

/** Existing site accounts are outside this rollout. No flag is activated here. */
export async function isClassPreparationEnabled(
  userId: string,
  organizationId?: string | null
) {
  if (
    !(await isFeatureFlagEnabled(FREE_TIER_ONBOARDING_V2_FLAG, organizationId))
  )
    return false;
  const siteMembership = await prisma.orgMembership.findFirst({
    where: {
      userId,
      organization: {
        plan: { not: 'FREE_CLASSROOM' },
        id: { not: 'default-org' },
      },
    },
    select: { id: true },
  });
  return !siteMembership;
}

/** Saves only application settings. Never provisions, changes status, or sends mail. */
export async function saveClassPreparation(args: {
  applicationId: string;
  userId: string;
  className: string;
  grade: string;
}) {
  const parsed = parseClassPreparation(args.className, args.grade);
  if (!parsed.ok) return parsed;
  const application = await prisma.freeTierApplication.findFirst({
    where: { id: args.applicationId, userId: args.userId },
    select: { organizationId: true },
  });
  if (
    !application ||
    !(await isClassPreparationEnabled(args.userId, application.organizationId))
  ) {
    return { ok: false as const, reason: 'not_allowed' as const };
  }
  return prisma.$transaction(async (tx) => {
    // Share the existing provisioning lock: repeated saves never create a class,
    // and preparation cannot race the approval/provisioning lifecycle.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_provision:' || ${args.applicationId}))`;
    const result = await tx.freeTierApplication.updateMany({
      where: {
        id: args.applicationId,
        userId: args.userId,
        status: 'ACCOUNT_CREATED',
        organizationId: null,
      },
      data: {
        starterClassName: parsed.className,
        starterClassGrade: parsed.grade,
      },
    });
    return result.count
      ? { ok: true as const }
      : { ok: false as const, reason: 'not_allowed' as const };
  });
}
