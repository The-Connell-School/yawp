import { prisma } from '~/utils/db.server';
import { pickNextClassArtIndexForOrganization } from '~/utils/class-art';

/**
 * Picks a classArtIndex for a new class in an organization. The org cycles
 * through every artwork at crop 0, then every artwork at crop 1, and so on.
 */
export async function pickClassArtIndexForOrganization(
  organizationId: string,
  random: () => number = Math.random
): Promise<number> {
  const classes = await prisma.class.findMany({
    where: {
      school: { organizationId },
      classArtIndex: { not: null },
      isArchived: false,
    },
    select: { classArtIndex: true },
  });

  return pickNextClassArtIndexForOrganization(
    classes.map((klass) => klass.classArtIndex!),
    random
  );
}
