import type { OrganizationPlan } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import {
  resolveSiteLicenseLockedAssignmentTiles,
  type SiteLicenseLockedAssignmentTile,
} from '~/domain/free-tier/site-license-locked-assignment-tiles';

/**
 * Free-classroom orgs only receive the free bundle in organizationAssignmentType
 * (see provision-free-classroom). Locked tiles must match against the global
 * assignment-type catalog, not scope-filtered types the teacher can create.
 */
export async function loadSiteLicenseLockedAssignmentTiles(
  organization: Pick<{ plan: OrganizationPlan }, 'plan'>,
  client: Pick<typeof prisma, 'assignmentType'> = prisma
): Promise<SiteLicenseLockedAssignmentTile[]> {
  if (organization.plan !== 'FREE_CLASSROOM') return [];

  const catalogTypes = await client.assignmentType.findMany({
    where: { archivedAt: null },
    select: { id: true, title: true, kind: true, systemKey: true },
    orderBy: { position: 'asc' },
  });

  return resolveSiteLicenseLockedAssignmentTiles(catalogTypes);
}
