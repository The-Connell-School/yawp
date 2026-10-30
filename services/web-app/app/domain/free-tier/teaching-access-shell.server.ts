import { prisma } from '~/utils/db.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isApprovalV2Enabled } from '~/domain/free-tier/approval-v2.server';
export type TeachingAccessShellState =
  | { variant: 'none' }
  | { variant: 'loading' }
  | {
      variant: 'locked';
      applicationId: string;
      adminName: string;
      adminEmail: string | null;
      pendingApprovalId: string | null;
      schoolName: string;
      approvalFirstSentAt: string | null;
      forwardDisclosureAvailable: boolean;
    }
  | {
      variant: 'unlocked';
      applicationId: string;
      showApprovalToast: boolean;
    };

export async function loadTeachingAccessShellState(args: {
  userId: string;
  membershipId?: string | null;
  role: string;
  organizationPlan: string;
  organizationId: string;
}): Promise<TeachingAccessShellState> {
  if (args.role !== 'TEACHER' || args.organizationPlan !== 'FREE_CLASSROOM') {
    return { variant: 'none' };
  }
  if (
    !(await isFeatureFlagEnabled(FREE_TIER_FLAG, args.organizationId))
  ) {
    return { variant: 'none' };
  }

  const application = await prisma.freeTierApplication.findFirst({
    where: { userId: args.userId },
    select: {
      id: true,
      status: true,
      schoolName: true,
      organizationId: true,
      lockedPreviewApprovalToastSeenAt: true,
      adminApprovals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          adminName: true,
          adminEmail: true,
          firstSentAt: true,
        },
      },
    },
  });
  if (!application) return { variant: 'none' };

  if (application.status === 'SENT' || application.status === 'MANUAL_REVIEW') {
    const pendingApproval = application.adminApprovals[0];
    const adminName = pendingApproval?.adminName ?? 'your administrator';
    const forwardDisclosureAvailable =
      application.status === 'SENT' &&
      pendingApproval != null &&
      (await isApprovalV2Enabled(application));
    return {
      variant: 'locked',
      applicationId: application.id,
      adminName,
      adminEmail: pendingApproval?.adminEmail ?? null,
      pendingApprovalId: pendingApproval?.id ?? null,
      schoolName: application.schoolName ?? 'your school',
      approvalFirstSentAt: pendingApproval?.firstSentAt?.toISOString() ?? null,
      forwardDisclosureAvailable,
    };
  }

  if (application.status === 'APPROVED') {
    return {
      variant: 'unlocked',
      applicationId: application.id,
      showApprovalToast: !application.lockedPreviewApprovalToastSeenAt,
    };
  }

  return { variant: 'none' };
}

export async function markTeachingAccessApprovalToastSeen(applicationId: string) {
  await prisma.freeTierApplication.updateMany({
    where: {
      id: applicationId,
      lockedPreviewApprovalToastSeenAt: null,
    },
    data: { lockedPreviewApprovalToastSeenAt: new Date() },
  });
}
