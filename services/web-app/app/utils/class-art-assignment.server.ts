import { prisma } from '~/utils/db.server';
import {
  classArtKeyFromLegacyPoolIndex,
  pickNextClassArtKeyForOrganization,
} from '~/utils/class-art';

/**
 * Picks a classArtKey for a new class in an organization. The org cycles
 * through every artwork at crop 0, then every artwork at crop 1, and so on.
 */
export async function pickClassArtKeyForOrganization(
  organizationId: string,
  random: () => number = Math.random
): Promise<string> {
  const classes = await prisma.class.findMany({
    where: {
      school: { organizationId },
      isArchived: false,
      OR: [{ classArtKey: { not: null } }, { classArtIndex: { not: null } }],
    },
    select: { classArtKey: true, classArtIndex: true },
  });

  const assignedKeys = classes.flatMap((klass) => {
    if (klass.classArtKey) return [klass.classArtKey];
    if (klass.classArtIndex == null) return [];
    const legacyKey = classArtKeyFromLegacyPoolIndex(klass.classArtIndex);
    return legacyKey ? [legacyKey] : [];
  });

  return pickNextClassArtKeyForOrganization(assignedKeys, random);
}

/** @deprecated Use pickClassArtKeyForOrganization */
export async function pickClassArtIndexForOrganization(
  organizationId: string,
  random: () => number = Math.random
): Promise<number> {
  const { getClassArtByKey, CLASS_ART_POOL } = await import('~/utils/class-art');
  const key = await pickClassArtKeyForOrganization(organizationId, random);
  const index = CLASS_ART_POOL.findIndex((entry) => entry.key === key);
  if (index >= 0) return index;
  const art = getClassArtByKey(key);
  return art ? CLASS_ART_POOL.findIndex((entry) => entry.key === art.key) : 0;
}
