import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  UA_PREVIEW_ORG_ID,
  UA_PREVIEW_ORG_NAME,
} from '../../../../packages/prisma/scripts/local-dev/dev-personas';
import {
  PREVIEW_FREE_CLASSROOM_ORG_ID,
  PREVIEW_FREE_CLASSROOM_ORG_NAME,
} from '../../../../packages/prisma/scripts/local-dev/seed-preview-free-classroom';
import { prisma } from '~/utils/db.server';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';

export type DevPanelOrganization = { id: string; name: string };

export async function listDevPanelOrganizations(
  request: Request
): Promise<DevPanelOrganization[]> {
  if (!isLocalDevAuthEnabled()) return [];

  if (isPreviewDevLoginAccessCodeRequired()) {
    const seat = await getPreviewAccessSeat(request);
    if (!seat) return [];
    const organization = await prisma.organization.findUnique({
      where: { id: seat.organizationId },
      select: { id: true, name: true },
    });
    return organization ? [organization] : [];
  }

  const known = [
    { id: LOCAL_DEV_ORG_ID, name: LOCAL_DEV_ORG_NAME },
    { id: UA_PREVIEW_ORG_ID, name: UA_PREVIEW_ORG_NAME },
    { id: PREVIEW_FREE_CLASSROOM_ORG_ID, name: PREVIEW_FREE_CLASSROOM_ORG_NAME },
  ];
  const existing = await prisma.organization.findMany({
    where: { id: { in: known.map((entry) => entry.id) } },
    select: { id: true, name: true },
  });
  const names = new Map(existing.map((row) => [row.id, row.name] as const));
  return known
    .filter((entry) => names.has(entry.id))
    .map((entry) => ({ id: entry.id, name: names.get(entry.id)! }));
}
