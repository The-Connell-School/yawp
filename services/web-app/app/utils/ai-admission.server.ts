import { prisma } from '~/utils/db.server';

export class AiRateLimitError extends Error {
  readonly retryAfterSeconds: number;
  readonly scope: 'membership' | 'organization';

  constructor(
    retryAfterSeconds: number,
    scope: 'membership' | 'organization' = 'membership'
  ) {
    super('AI request budget exhausted');
    this.name = 'AiRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.scope = scope;
  }
}

export type AiAdmissionPolicy = {
  membershipLimit: number;
  membershipWindowMs: number;
  organizationLimit: number;
  organizationWindowMs: number;
};

/**
 * Atomically reserves capacity before an AI call.
 *
 * PostgreSQL transaction-scoped advisory locks close the race between counting
 * and inserting without holding application-process state. Reservations are
 * intentionally retained when a provider call fails: failed and concurrent
 * attempts still consume capacity and cannot be used to bypass spend limits.
 */
export class AiLockedForFreeTierError extends Error {
  constructor() {
    super('AI is locked until school administrator approval');
    this.name = 'AiLockedForFreeTierError';
  }
}

export class AiFreeTierBudgetExceededError extends Error {
  constructor() {
    super('Free-tier AI spend is paused because the budget is exhausted');
    this.name = 'AiFreeTierBudgetExceededError';
  }
}

export function aiLockedForFreeTierMessage() {
  return 'Writing tools unlock after your school administrator approves Yawp! for your classroom.';
}

export function aiFreeTierBudgetExceededMessage() {
  return 'Writing tools are paused because this free-tier environment has reached its current budget.';
}

export function aiAdmissionErrorResponse(error: unknown): Response | null {
  if (error instanceof AiLockedForFreeTierError) {
    return Response.json({ error: 'ai_locked', message: aiLockedForFreeTierMessage() }, { status: 403 });
  }
  if (error instanceof AiFreeTierBudgetExceededError) {
    return Response.json(
      { error: 'free_tier_budget_exceeded', message: aiFreeTierBudgetExceededMessage() },
      { status: 402 }
    );
  }
  return null;
}

/** Check free-tier approval/budget before generation that does not reserve a quota.
 * Paid plans and environments with the flag off keep their existing behavior.
 */
export async function assertAiFreeTierSpendAllowed(
  organizationId: string,
  options?: { feature?: string }
): Promise<void> {
  const { assertOrganizationTeachingApproved } = await import('~/domain/free-tier/locked-preview.server');
  await assertOrganizationTeachingApproved(
    prisma,
    organizationId,
    options?.feature === 'lesson-planner'
      ? { allowPendingLessonPlanner: true }
      : undefined
  );
  const { isFreeTierEnabled } = await import(
    '~/domain/feature-flags/feature-flags.server'
  );
  if (await isFreeTierEnabled()) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, plan: true },
    });
    if (org) {
      const { isAiUnlocked } = await import('~/domain/free-tier/is-ai-unlocked.server');
      let unlocked = await isAiUnlocked(org);
      if (!unlocked && options?.feature === 'lesson-planner') {
        const { organizationHasPendingFreeTierLessonPlannerMetering } =
          await import('~/domain/free-tier/locked-preview.server');
        unlocked =
          await organizationHasPendingFreeTierLessonPlannerMetering(
            organizationId
          );
      }
      if (!unlocked) {
        throw new AiLockedForFreeTierError();
      }
      if (org.plan === 'FREE_CLASSROOM') {
        const {
          assertFreeTierSpendAllowed,
          FreeTierSpendGuardDeniedError,
        } = await import('~/domain/free-tier/usage-budget.server');
        try {
          await assertFreeTierSpendAllowed();
        } catch (error) {
          if (error instanceof FreeTierSpendGuardDeniedError) {
            throw new AiFreeTierBudgetExceededError();
          }
          throw error;
        }
      }
    }
  }
}

export async function reserveAiRequest({
  membershipId,
  organizationId,
  feature,
  policy,
  units = 1,
  now = new Date(),
}: {
  membershipId: string;
  organizationId: string;
  feature: string;
  policy: AiAdmissionPolicy;
  units?: number;
  now?: Date;
}): Promise<void> {
  if (!Number.isInteger(units) || units < 1) {
    throw new Error('AI reservation units must be a positive integer');
  }
  await assertAiFreeTierSpendAllowed(organizationId, { feature });
  const membershipSince = new Date(now.getTime() - policy.membershipWindowMs);
  const organizationSince = new Date(
    now.getTime() - policy.organizationWindowMs
  );

  await prisma.$transaction(async (transaction) => {
    // All callers acquire organization then membership locks, preventing
    // deadlocks when many users in the same tenant arrive simultaneously.
    await transaction.$queryRaw`
      SELECT 1::integer AS "locked"
      FROM pg_advisory_xact_lock(
        hashtextextended(${'ai-admission:org:' + organizationId + ':' + feature}, 0)
      )
    `;
    await transaction.$queryRaw`
      SELECT 1::integer AS "locked"
      FROM pg_advisory_xact_lock(
        hashtextextended(${'ai-admission:member:' + membershipId + ':' + feature}, 0)
      )
    `;

    await transaction.aiRequestReservation.deleteMany({
      where: {
        organizationId,
        feature,
        createdAt: {
          lt:
            organizationSince < membershipSince
              ? organizationSince
              : membershipSince,
        },
      },
    });

    const [membershipCount, organizationCount] = await Promise.all([
      transaction.aiRequestReservation.count({
        where: {
          membershipId,
          organizationId,
          feature,
          createdAt: { gte: membershipSince },
        },
      }),
      transaction.aiRequestReservation.count({
        where: {
          organizationId,
          feature,
          createdAt: { gte: organizationSince },
        },
      }),
    ]);

    if (membershipCount + units > policy.membershipLimit) {
      const oldestMembership = await transaction.aiRequestReservation.findFirst({
        where: {
          membershipId,
          organizationId,
          feature,
          createdAt: { gte: membershipSince },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      const retryAfterSeconds = oldestMembership
        ? Math.max(
            1,
            Math.ceil(
              (oldestMembership.createdAt.getTime() +
                policy.membershipWindowMs -
                now.getTime()) /
                1000
            )
          )
        : Math.max(1, Math.ceil(policy.membershipWindowMs / 1000));
      throw new AiRateLimitError(retryAfterSeconds, 'membership');
    }
    if (organizationCount + units > policy.organizationLimit) {
      const oldestOrganization =
        await transaction.aiRequestReservation.findFirst({
          where: {
            organizationId,
            feature,
            createdAt: { gte: organizationSince },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
      const retryAfterSeconds = oldestOrganization
        ? Math.max(
            1,
            Math.ceil(
              (oldestOrganization.createdAt.getTime() +
                policy.organizationWindowMs -
                now.getTime()) /
                1000
            )
          )
        : Math.max(1, Math.ceil(policy.organizationWindowMs / 1000));
      throw new AiRateLimitError(retryAfterSeconds, 'organization');
    }

    await transaction.aiRequestReservation.createMany({
      data: Array.from({ length: units }, () => ({
        membershipId,
        organizationId,
        feature,
        createdAt: now,
      })),
    });
  });
}
