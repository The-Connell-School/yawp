import type { OrganizationPlan, Prisma } from '@app/prisma';
import { getEntitlements } from '~/utils/entitlements.server';
import { FREE_CLASS_CLASS_FULL_MESSAGE } from './class-seat-cap';

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

function pendingInviteTargetsClass(metadata: string | null, classId: string) {
  if (!metadata) return false;
  try {
    const parsed = JSON.parse(metadata) as { klassId?: string };
    return parsed.klassId === classId;
  } catch {
    return metadata.includes(classId);
  }
}

export async function countFreeClassSeatUsage(
  tx: Prisma.TransactionClient,
  classId: string
) {
  const currentStudents = await tx.orgMembership.count({
    where: {
      role: 'STUDENT',
      isActive: true,
      classesAsStudent: { some: { id: classId } },
    },
  });

  const inviteRows = await tx.invitation.findMany({
    where: {
      type: 'onboard-student',
      expiresAt: { gt: new Date() },
    },
    select: { metadata: true },
  });
  const pendingInvites = inviteRows.filter((row) =>
    pendingInviteTargetsClass(row.metadata, classId)
  ).length;

  return { currentStudents, pendingInvites };
}

/**
 * Locks the class row and enforces the free-tier per-class student cap (35).
 * No-op for non–FREE_CLASSROOM orgs.
 */
export async function assertFreeClassSeatAvailableInTx(
  tx: Prisma.TransactionClient,
  params: { classId: string; organizationId: string }
): Promise<FreeClassSeatCheckResult> {
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

  const usage = await countFreeClassSeatUsage(tx, params.classId);
  const entitlements = getEntitlements(plan);
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
