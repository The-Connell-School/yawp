import { prisma } from '~/utils/db.server';
import { CLASS_ART_POOL_SIZE, pickNextClassArtIndex } from '~/utils/class-art';

/**
 * Picks a classArtIndex for a new class, avoiding the indices most recently
 * assigned to any of the given teachers' other classes so a teacher rotates
 * through the full pool before any artwork repeats.
 */
export async function pickClassArtIndexForTeachers(
  teacherIds: readonly string[]
): Promise<number> {
  const recent = await prisma.class.findMany({
    where: {
      teachers: { some: { id: { in: [...teacherIds] } } },
      classArtIndex: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: CLASS_ART_POOL_SIZE - 1,
    select: { classArtIndex: true },
  });

  return pickNextClassArtIndex(
    recent.map((klass) => klass.classArtIndex!)
  );
}
