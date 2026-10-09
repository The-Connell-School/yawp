import type { Organization } from '@app/prisma';
import { prisma } from '~/utils/db.server';

/**
 * Free-tier AI is unlocked only after school admin approval is recorded.
 * SCHOOL (and other paid plans) always short-circuit to true.
 */
export async function isAiUnlocked(org: Pick<Organization, 'id' | 'plan'>): Promise<boolean> {
  if (org.plan !== 'FREE_CLASSROOM') return true;
  const app = await prisma.freeTierApplication.findFirst({
    where: { organizationId: org.id, status: 'APPROVED' },
    select: { id: true },
  });
  return Boolean(app);
}
