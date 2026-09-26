import { prisma } from '~/utils/db.server';

import { defaultWritingTimeMinutesForKind } from './writing-time';

/**
 * The writing time the creation form suggests for each assignment type, by id.
 * One query for the whole list. Types with no suggestion are absent.
 */
export async function getDefaultWritingTimeMinutesByTypeId(
  assignmentTypeIds: string[]
): Promise<Map<string, number>> {
  const defaults = new Map<string, number>();
  if (assignmentTypeIds.length === 0) return defaults;

  const rows = await prisma.assignmentType.findMany({
    where: { id: { in: assignmentTypeIds } },
    select: { id: true, kind: true },
  });
  for (const row of rows ?? []) {
    const minutes = defaultWritingTimeMinutesForKind(row.kind);
    if (minutes !== null) defaults.set(row.id, minutes);
  }
  return defaults;
}
