import type { Prisma } from '@app/prisma';
/** Shared by public approval, forwarding, delivery and staff status decisions.
 * Acquire before the release-budget lock to preserve lock ordering. */
export async function lockApprovalApplication(
  tx: Prisma.TransactionClient,
  id: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_approval:' || ${id}))`;
}
