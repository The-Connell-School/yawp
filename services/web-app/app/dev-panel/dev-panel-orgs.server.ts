import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  UA_PREVIEW_ORG_ID,
  UA_PREVIEW_ORG_NAME,
} from '../../../../packages/prisma/scripts/local-dev/dev-personas';
import { prisma } from '~/utils/db.server';

const PREVIEW_FREE_CLASSROOM_ORG_ID = 'preview-free-classroom';
const PREVIEW_FREE_CLASSROOM_ORG_NAME = 'Yawp Preview — Free Classroom';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';

export type DevPanelOrganization = { id: string; name: string; kind: string };

export async function assertDevPanelOrganizationInSeatScope(
  request: Request,
  organizationId: string
): Promise<Response | null> {
  if (!isPreviewDevLoginAccessCodeRequired()) return null;
  const seat = await getPreviewAccessSeat(request);
  if (!seat) {
    return Response.json(
      { error: 'Preview access code required.' },
      { status: 401 }
    );
  }
  if (seat.organizationId !== organizationId) {
    return Response.json(
      { error: 'Organization is not in your preview seat.' },
      { status: 403 }
    );
  }
  return null;
}

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
    select: { id: true, name: true, plan: true },
  });
  const byId = new Map(existing.map((row) => [row.id, row] as const));
  return known
    .filter((entry) => byId.has(entry.id))
    .map((entry) => {
      const row = byId.get(entry.id)!;
      return {
        id: entry.id,
        name: row.name,
        kind: row.plan === 'FREE_CLASSROOM' ? 'Free' : 'School',
      };
    });
}
