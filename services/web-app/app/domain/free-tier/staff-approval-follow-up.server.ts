import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { safeErrorTextForLog } from '~/utils/server-error-request-context.server';
import { sendFreeTierCongratulationsEmail } from './email.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';

/** Shown in the congratulations email when Yawp! staff approve, not a school administrator. */
export const STAFF_APPROVAL_EMAIL_ADMIN_NAME = 'Yawp!';

/**
 * A staff approval replaces any open administrator request. SUPERSEDED is the
 * existing terminal status for a request that was closed without that
 * administrator deciding. The manual follow-up flag comes off so the operator
 * queue does not keep asking for a nudge.
 */
export async function supersedePendingAdminRequests(
  tx: Prisma.TransactionClient,
  applicationId: string,
  now = new Date()
) {
  const pending = await tx.freeTierAdminApproval.findMany({
    where: { applicationId, status: 'PENDING' },
    select: { id: true },
  });
  if (pending.length === 0) return;
  const ids = pending.map((row) => row.id);
  await tx.freeTierApprovalDelivery.updateMany({
    where: { approvalId: { in: ids }, state: 'QUEUED' },
    data: { state: 'CANCELLED', error: 'approved' },
  });
  await tx.freeTierAdminApproval.updateMany({
    where: { id: { in: ids }, status: 'PENDING' },
    data: {
      status: 'SUPERSEDED',
      decidedAt: now,
      needsManualFollowUp: false,
      autoRemindersStopped: true,
      stopReason: 'approved',
      nextAutoReminderAt: null,
      nextTeacherFollowUpAt: null,
    },
  });
}

/**
 * Same congratulations email the school-admin path sends. A successful log
 * already on the application means this approve is a repeat, so it does not
 * send again.
 */
export async function sendStaffApprovalCongratulationsIfNeeded(app: {
  id: string;
  email: string;
  name: string;
}) {
  const existing = await prisma.freeTierEmailLog.findFirst({
    where: { applicationId: app.id, kind: 'congratulations', success: true },
    select: { id: true },
  });
  if (existing) return { ok: true as const, skipped: true as const };
  try {
    const signInUrl = `${freeTierPublicAppOrigin()}/auth/login`;
    return await sendFreeTierCongratulationsEmail({
      applicationId: app.id,
      teacherEmail: app.email,
      teacherName: app.name,
      adminName: STAFF_APPROVAL_EMAIL_ADMIN_NAME,
      signInUrl,
    });
  } catch (error) {
    const message = safeErrorTextForLog(error);
    try {
      await prisma.freeTierEmailLog.create({
        data: {
          applicationId: app.id,
          kind: 'congratulations',
          toEmail: app.email,
          success: false,
          error: message,
        },
      });
    } catch {
      // A log failure must not undo the recorded staff decision.
    }
    return { ok: false as const, error: message };
  }
}
