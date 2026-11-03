import { prisma } from '~/utils/db.server';

/**
 * Records the first time a student opened a class assignment. Idempotent: later
 * calls are no-ops so Start can be retried without clobbering the original time.
 */
export async function recordClassAssignmentFirstOpen({
  classAssignmentId,
  membershipId,
}: {
  classAssignmentId: string;
  membershipId: string;
}) {
  await prisma.classAssignmentStudentFirstOpen.createMany({
    data: [{ classAssignmentId, membershipId }],
    skipDuplicates: true,
  });
}

/** Class assignments this student has already opened (explicit record or prior work). */
export function openedClassAssignmentIdsForStudent({
  firstOpenClassAssignmentIds,
  documentClassAssignmentIds,
}: {
  firstOpenClassAssignmentIds: string[];
  documentClassAssignmentIds: Array<string | null | undefined>;
}): Set<string> {
  const opened = new Set(firstOpenClassAssignmentIds);
  for (const id of documentClassAssignmentIds) {
    if (id) opened.add(id);
  }
  return opened;
}

export function isNewStudentClassAssignment(
  classAssignmentId: string,
  openedIds: Set<string>
): boolean {
  return !openedIds.has(classAssignmentId);
}
