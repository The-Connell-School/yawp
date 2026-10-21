import { prisma } from '~/utils/db.server';
import { getApprovalWaitingDetails } from './approval-v2.server';
import { getLockedPreviewApplication } from './locked-preview.server';
import { LOCKED_PREVIEW_MESSAGE } from './locked-preview';

export type LockedPreviewShellState = {
  message: typeof LOCKED_PREVIEW_MESSAGE;
  status: string;
  adminName: string | null;
  sentOnLabel: string | null;
  applicationId: string;
  canResend: boolean;
  approvalV2: Awaited<ReturnType<typeof getApprovalWaitingDetails>> | null;
};

export async function loadLockedPreviewShellState(
  userId: string,
  membershipId?: string | null
): Promise<LockedPreviewShellState | null> {
  const app = await getLockedPreviewApplication(userId, membershipId);
  if (!app || !['SENT', 'MANUAL_REVIEW'].includes(app.status)) return null;

  const row = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      status: true,
      adminApprovals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { adminName: true, firstSentAt: true },
      },
    },
  });
  if (!row) return null;

  const pending = row.adminApprovals[0];
  const approvalV2 = await getApprovalWaitingDetails({
    id: row.id,
    userId: row.userId!,
    organizationId: row.organizationId,
  });
  const sentOnLabel = approvalV2?.firstSentAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(approvalV2.firstSentAt)
    : pending?.firstSentAt
      ? new Intl.DateTimeFormat('en-US', {
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(pending.firstSentAt)
      : null;

  return {
    message: LOCKED_PREVIEW_MESSAGE,
    status: row.status,
    adminName: pending?.adminName ?? null,
    sentOnLabel,
    applicationId: row.id,
    canResend: row.status === 'SENT',
    approvalV2,
  };
}
