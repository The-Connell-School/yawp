import type { OrganizationPlan } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { assignmentTypeMatchesSiteLicenseLockedTile } from './site-license-locked-assignment-tiles';

/**
 * Whether this teacher's org may download or stream How to Teach It assets for
 * this assignment type. Paid and site-license orgs are unchanged.
 */
export async function isAssignmentTypeHowToTeachLockedForTeacher({
  organizationPlan,
  assignmentTypeId,
}: {
  organizationPlan: OrganizationPlan;
  assignmentTypeId: string;
}) {
  if (organizationPlan !== 'FREE_CLASSROOM') return false;
  const type = await prisma.assignmentType.findFirst({
    where: { id: assignmentTypeId, archivedAt: null },
    select: {
      title: true,
      kind: true,
      systemKey: true,
      ownerOrgId: true,
      ownerMembershipId: true,
    },
  });
  if (!type) return false;
  return assignmentTypeMatchesSiteLicenseLockedTile(type);
}

/** True when a free-classroom teacher must not fetch locked course files. */
export async function shouldBlockSiteLicenseCourseAsset(request: Request) {
  const url = new URL(request.url);
  const userId = await requireUserId(request).catch(() => null);
  if (!userId) return true;
  const profile = await requireMembership(request, userId).catch(() => null);
  if (!profile || profile.role !== 'TEACHER') return true;
  if (profile.organization.plan !== 'FREE_CLASSROOM') return false;
  const assignmentTypeId = url.searchParams.get('assignmentTypeId');
  if (assignmentTypeId) {
    return isAssignmentTypeHowToTeachLockedForTeacher({
      organizationPlan: profile.organization.plan,
      assignmentTypeId,
    });
  }
  // Thesis-Driven Essay course files are site-license-only on the free tier.
  return true;
}