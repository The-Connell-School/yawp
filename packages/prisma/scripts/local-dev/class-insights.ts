import type { Prisma, PrismaClient } from '../../generated/prisma';

type ClassInsightsClient = Pick<
  PrismaClient | Prisma.TransactionClient,
  'organization'
>;

export async function enableClassInsightsForOrganizations(
  prisma: ClassInsightsClient,
  organizationIds: string[],
) {
  const results: Array<{ organizationId: string; enabled: boolean }> = [];

  for (const organizationId of organizationIds) {
    const updated = await prisma.organization.updateMany({
      where: { id: organizationId },
      data: { classInsightsEnabled: true },
    });
    results.push({ organizationId, enabled: updated.count === 1 });
  }

  return results;
}
