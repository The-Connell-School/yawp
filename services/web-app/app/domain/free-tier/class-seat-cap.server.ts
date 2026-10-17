import type { OrganizationPlan, Prisma } from '@app/prisma';
import { getEntitlementsForPlan } from '~/utils/entitlements.server';
import { effectiveFreeTierLimits } from './limits.server';
import { FREE_CLASS_CLASS_FULL_MESSAGE } from './class-seat-cap';
import {
  lockClassCollaborationDeployments,
  lockStudentRosters,
} from '~/domain/collaboration/class-assignment-lock.server';
import { prisma } from '~/utils/db.server';
import { FreeClassSeatError } from './free-class-seat-error';
import { assertOrganizationTeachingApproved } from './locked-preview.server';

export type FreeClassSeatCheckResult =
  | { ok: true; plan: OrganizationPlan }
  | {
      ok: false;
      code: 'class_not_found' | 'class_full';
      error: string;
    };

export async function lockClassRosterSeatCap(
  tx: Prisma.TransactionClient,
  classId: string
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Class"
    WHERE "id" = ${classId}
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new Error('Class not found');
  }
}

export async function countFreeClassSeatUsage(
  tx: Prisma.TransactionClient,
  classId: string,
  includeNonExpiringInvites = false
) {
  const currentStudents = await tx.orgMembership.count({
    where: {
      role: 'STUDENT',
      isActive: true,
      classesAsStudent: { some: { id: classId } },
    },
  });

  const pendingInvites = await tx.invitation.count({
    where: {
      type: 'onboard-student',
      studentClassId: classId,
      ...(includeNonExpiringInvites
        ? { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] }
        : { expiresAt: { gt: new Date() } }),
    },
  });

  return { currentStudents, pendingInvites };
}

/**
 * Locks the class row and enforces the configured free-tier per-class student cap.
 * No-op for non–FREE_CLASSROOM orgs.
 */
export async function assertFreeClassSeatAvailableInTx(
  tx: Prisma.TransactionClient,
  params: { classId: string; organizationId: string }
): Promise<FreeClassSeatCheckResult> {
  await assertOrganizationTeachingApproved(tx, params.organizationId);
  await lockClassRosterSeatCap(tx, params.classId);

  const klass = await tx.class.findFirst({
    where: {
      id: params.classId,
      school: { organizationId: params.organizationId },
    },
    select: {
      school: { select: { organization: { select: { plan: true } } } },
    },
  });

  if (!klass) {
    return {
      ok: false,
      code: 'class_not_found',
      error: 'Class not found.',
    };
  }

  const plan = klass.school.organization.plan;
  if (plan !== 'FREE_CLASSROOM') {
    return { ok: true, plan };
  }

  const { limits, monthly } = await effectiveFreeTierLimits(params.organizationId, tx);
  const usage = await countFreeClassSeatUsage(tx, params.classId, monthly);
  const entitlements = getEntitlementsForPlan(plan, limits);
  if (
    !entitlements.canAddStudent({
      currentStudents: usage.currentStudents,
      pendingInvites: usage.pendingInvites,
    })
  ) {
    return {
      ok: false,
      code: 'class_full',
      error: FREE_CLASS_CLASS_FULL_MESSAGE,
    };
  }

  return { ok: true, plan };
}

export type EnrollStudentInClassResult =
  | { ok: true }
  | { ok: false; code: 'class_not_found' | 'class_full'; error: string };

/** Shared enrollment choke point (seat cap + collaboration locks). */
export async function enrollStudentInClassWithSeatCap(params: {
  membershipId: string;
  classId: string;
  organizationId: string;
  client?: Prisma.TransactionClient;
}): Promise<EnrollStudentInClassResult> {
  const run = async (tx: Prisma.TransactionClient) => {
    const seat = await assertFreeClassSeatAvailableInTx(tx, {
      classId: params.classId,
      organizationId: params.organizationId,
    });
    if (!seat.ok) {
      return {
        ok: false as const,
        code: seat.code,
        error: seat.error,
      };
    }
    await lockStudentRosters(tx, [params.membershipId]);
    await lockClassCollaborationDeployments(tx, params.classId);
    await tx.orgMembership.update({
      where: { id: params.membershipId },
      data: { classesAsStudent: { connect: { id: params.classId } } },
    });
    return { ok: true as const };
  };

  if (params.client) {
    return run(params.client);
  }
  return prisma.$transaction(run);
}

export function throwIfSeatCheckFailed(
  result: FreeClassSeatCheckResult
): void {
  if (result.ok) return;
  throw new FreeClassSeatError(result.code, result.error);
}
