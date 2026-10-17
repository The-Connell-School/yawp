import type { Organization, Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { effectiveFreeTierLimits } from './limits.server';
import { DEFAULT_FREE_TIER_LIMITS } from './limits';

/** P8 consumer gate. The existing I5 base/organization targeting remains authoritative. */
export async function monthlyFreeTierPolicy(
  organization: Pick<Organization, 'id' | 'plan'>,
  db: Prisma.TransactionClient = prisma
) {
  if (organization.plan !== 'FREE_CLASSROOM')
    return { enabled: false, limits: DEFAULT_FREE_TIER_LIMITS };
  const { limits, monthly } = await effectiveFreeTierLimits(
    organization.id,
    db
  );
  if (!monthly) return { enabled: false, limits };
  const approved = await db.freeTierApplication.findFirst({
    where: { organizationId: organization.id, status: 'APPROVED' },
    select: { id: true },
  });
  return { enabled: Boolean(approved), limits };
}
