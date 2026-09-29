import { prisma } from '~/utils/db.server';

import { offersParagraphModesForKind } from '~/domain/assignment-types/daily-pages-paragraph-modes';

import { defaultWritingTimeMinutesForKind } from './writing-time';

export type CreationTypeDefaults = {
  defaultWritingTimeMinutes: number | null;
  offersParagraphModes: boolean;
};

/**
 * What the creation form needs to know about each assignment type beyond its
 * rubric, by id: the writing time it suggests and whether it takes a paragraph
 * type. One query for the whole list. Types with neither are absent.
 */
export async function getCreationTypeDefaultsById(
  assignmentTypeIds: string[]
): Promise<Map<string, CreationTypeDefaults>> {
  const defaults = new Map<string, CreationTypeDefaults>();
  if (assignmentTypeIds.length === 0) return defaults;

  const rows = await prisma.assignmentType.findMany({
    where: { id: { in: assignmentTypeIds } },
    select: { id: true, kind: true },
  });
  for (const row of rows ?? []) {
    const defaultWritingTimeMinutes = defaultWritingTimeMinutesForKind(row.kind);
    const offersParagraphModes = offersParagraphModesForKind(row.kind);
    if (defaultWritingTimeMinutes !== null || offersParagraphModes) {
      defaults.set(row.id, { defaultWritingTimeMinutes, offersParagraphModes });
    }
  }
  return defaults;
}
