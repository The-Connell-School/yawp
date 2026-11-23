import { prisma } from '~/utils/db.server';
import {
  classArtKeyFromLegacyPoolIndex,
  pickNextClassArtKeyForOrganization,
  resolveDistinctClassArtSelections,
} from '~/utils/class-art';

/**
 * The art each of a teacher's classes shows, distinct across the teacher's
 * active classes (oldest keeps its art). Every teacher page that draws a class
 * uses this so a class looks the same on the home page, My Classes and its own
 * page. Archived classes are not included; callers fall back to the stored key.
 */
export async function loadTeacherClassArtKeys(
  teacherMembershipId: string
): Promise<Map<string, string>> {
  const classes = await prisma.class.findMany({
    where: { teachers: { some: { id: teacherMembershipId } }, isArchived: false },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, classArtKey: true, classArtIndex: true },
  });
  const resolved = resolveDistinctClassArtSelections(
    classes.map((klass) => ({
      id: klass.id,
      classArtKey: klass.classArtKey,
      legacyClassArtIndex: klass.classArtIndex,
    }))
  );
  return new Map([...resolved].map(([id, art]) => [id, art.key]));
}

/**
 * Picks a classArtKey for a new class in an organization. The org cycles
 * through every artwork at crop 0, then every artwork at crop 1, and so on.
 */
export async function pickClassArtKeyForOrganization(
  organizationId: string,
  random: () => number = Math.random,
  teacherMembershipIds: readonly string[] = []
): Promise<string> {
  // Artwork the teacher's classes already show is skipped while any other is
  // free, so a teacher's classes never share a picture.
  const avoidArtworkKeys = new Set<string>();
  for (const teacherId of teacherMembershipIds) {
    const shown = await loadTeacherClassArtKeys(teacherId);
    for (const key of shown.values()) {
      avoidArtworkKeys.add(key.split('::')[0]);
    }
  }

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

  return pickNextClassArtKeyForOrganization(
    assignedKeys,
    random,
    avoidArtworkKeys
  );
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
