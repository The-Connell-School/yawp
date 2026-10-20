import type { OrganizationPlan } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  resolveSiteLicenseLockedAssignmentTiles,
  siteLicenseLockedPlatformAssignmentTypesWhere,
  type SiteLicenseLockedAssignmentTile,
} from '~/domain/free-tier/site-license-locked-assignment-tiles';

/**
 * Free-classroom orgs only receive the free bundle in organizationAssignmentType
 * (see provision-free-classroom). Locked tiles must match against the global
 * assignment-type catalog, not scope-filtered types the teacher can create.
 */
type SiteLicenseLockedAssignmentTilesClient = {
  assignmentType: {
    findMany: typeof prisma.assignmentType.findMany;
  };
};

export async function loadSiteLicenseLockedAssignmentTiles(
  organization: Pick<{ plan: OrganizationPlan }, 'plan'>,
  client: SiteLicenseLockedAssignmentTilesClient = prisma
): Promise<SiteLicenseLockedAssignmentTile[]> {
  if (organization.plan !== 'FREE_CLASSROOM') return [];

  const catalogTypes = await client.assignmentType.findMany({
    where: siteLicenseLockedPlatformAssignmentTypesWhere(),
    select: { id: true, title: true, kind: true, systemKey: true },
    orderBy: { position: 'asc' },
  });

  return resolveSiteLicenseLockedAssignmentTiles(catalogTypes);
}
