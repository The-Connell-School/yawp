/**
 * POST-MIGRATION ONLY — backfill Class.classArtKey from legacy classArtIndex
 * or org rotation for rows that never received an index.
 *
 * Run after prisma migrate deploy:
 *   cd packages/prisma && DATABASE_URL=... bun run scripts/backfill-class-art-key.ts
 */
import {
  classArtKeyFromLegacyPoolIndex,
  generateClassArt,
  pickNextClassArtKeyForOrganization,
} from '../../../services/web-app/app/utils/class-art.ts';

type ClassArtBackfillClassRow = {
  id: string;
  classArtIndex: number | null;
  classArtKey: string | null;
  school: { organizationId: string };
};

type ClassArtBackfillPrismaClient = {
  class: {
    findMany: (args: unknown) => Promise<ClassArtBackfillClassRow[]>;
    update: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
  };
};

export function assignedKeyForClass({
  classArtKey,
  classArtIndex,
  classId,
}: {
  classArtKey: string | null;
  classArtIndex: number | null;
  classId: string;
}): string | null {
  if (classArtKey) return classArtKey;
  if (classArtIndex != null) {
    return (
      classArtKeyFromLegacyPoolIndex(classArtIndex) ??
      generateClassArt(classId).key
    );
  }
  return null;
}

export function buildAssignedClassArtKeysByOrg(
  rows: readonly ClassArtBackfillClassRow[]
): Map<string, string[]> {
  const assignedByOrg = new Map<string, string[]>();
  for (const row of rows) {
    const key = assignedKeyForClass({
      classArtKey: row.classArtKey,
      classArtIndex: row.classArtIndex,
      classId: row.id,
    });
    if (!key) continue;
    const orgId = row.school.organizationId;
    assignedByOrg.set(orgId, [...(assignedByOrg.get(orgId) ?? []), key]);
  }
  return assignedByOrg;
}

export async function backfillClassArtKeys(
  prisma: ClassArtBackfillPrismaClient,
  random: () => number = Math.random
) {
  const existingAssignments = await prisma.class.findMany({
    where: {
      OR: [{ classArtKey: { not: null } }, { classArtIndex: { not: null } }],
    },
    select: {
      id: true,
      classArtIndex: true,
      classArtKey: true,
      school: { select: { organizationId: true } },
    },
  });

  const assignedByOrg = buildAssignedClassArtKeysByOrg(existingAssignments);
  const classesNeedingKey = await prisma.class.findMany({
    where: { classArtKey: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      classArtIndex: true,
      classArtKey: true,
      school: { select: { organizationId: true } },
    },
  });

  let updated = 0;

  for (const klass of classesNeedingKey) {
    let key = assignedKeyForClass(klass);

    if (!key) {
      const orgId = klass.school.organizationId;
      const assigned = assignedByOrg.get(orgId) ?? [];
      key = pickNextClassArtKeyForOrganization(assigned, random);
      assignedByOrg.set(orgId, [...assigned, key]);
    }

    await prisma.class.update({
      where: { id: klass.id },
      data: { classArtKey: key },
    });
    updated += 1;
  }

  const remaining = await prisma.class.count({
    where: { classArtKey: null },
  });

  return { updated, remaining };
}

if (import.meta.main) {
  const { createPrismaClient } = await import('./local-dev/connection');
  const prisma = createPrismaClient();
  const { updated, remaining } = await backfillClassArtKeys(prisma);

  console.log(`Backfilled classArtKey for ${updated} class(es).`);
  if (remaining > 0) {
    console.error(`Warning: ${remaining} class(es) still missing classArtKey.`);
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}
