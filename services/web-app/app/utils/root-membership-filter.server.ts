import { isYawpProductionEnvironment } from './lti/platform.server';
import { previewSessionAllowedWithoutSeatMembership } from './preview-session-seat.server';

type RootMembershipFilterOptions = {
  userId: string;
  internal: { membershipId: string; organizationId: string } | null;
  previewAccessSeat: { organizationId: string } | null;
  isolatedPreviewSeatMode: boolean;
};

export async function getRootMembershipWhere(
  {
    userId,
    internal,
    previewAccessSeat,
    isolatedPreviewSeatMode,
  }: RootMembershipFilterOptions,
  sessionAllowedWithoutSeatMembership = previewSessionAllowedWithoutSeatMembership
) {
  if (internal) {
    return {
      id: internal.membershipId,
      organizationId: internal.organizationId,
      isActive: true,
    };
  }

  if (
    previewAccessSeat &&
    isolatedPreviewSeatMode &&
    !(await sessionAllowedWithoutSeatMembership(userId))
  ) {
    return {
      organizationId: previewAccessSeat.organizationId,
      isActive: true,
    };
  }

  if (isYawpProductionEnvironment()) {
    return { isActive: true };
  }

  return undefined;
}
