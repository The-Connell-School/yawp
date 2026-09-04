import type { Prisma } from '@app/prisma';
import { buildAssignmentModuleSessionCreateData } from '~/domain/documents.server';
import { prisma } from '~/utils/db.server';

/**
 * The tutor on a shared draft: one coaching conversation per student.
 *
 * A solo document has exactly one student, so `AssignmentModuleSession` never
 * needed to say whose it was — it belonged to the document, and the document
 * belonged to a person. A shared draft breaks that assumption: without a member
 * on the row, every student in the group would be typing into one transcript,
 * and one of them finishing a module would advance it for everybody.
 *
 * Sessions on a shared draft carry a `membershipId`; solo sessions keep theirs
 * null, meaning "the document's owner". Assignment-owned artifacts are created
 * without any eager session, so no transcript ever needs a nominal owner.
 *
 * The draft stays shared; only the coaching is individual. That is the right
 * split — they are writing one document, but a question one student wants to ask
 * the tutor is not one they should have to ask in front of their group.
 */

/**
 * Which sessions belong to this student.
 *
 * The null branch is load-bearing: every session written before shared drafts
 * has a null membershipId, so requiring an exact match would hide all of them
 * and erase every existing student's tutor history from their own page.
 */
export function memberSessionWhere({
  membershipId,
  isShared,
}: {
  membershipId: string;
  isShared: boolean;
}): Prisma.AssignmentModuleSessionWhereInput {
  return isShared ? { membershipId } : { membershipId: null };
}

/**
 * Gives one member of a shared draft their own set of module sessions.
 *
 * Idempotent, and it backfills: a module added to the assignment type after the
 * group started writing appears for a student who already has the others.
 *
 */
export async function ensureMemberModuleSessions({
  documentId,
  assignmentTypeId,
  membershipId,
}: {
  documentId: string;
  assignmentTypeId: string;
  membershipId: string;
}): Promise<boolean> {
  const [modules, existing] = await Promise.all([
    prisma.assignmentModule.findMany({
      where: { assignmentTypeId, deletedAt: null },
      orderBy: { position: 'asc' },
      include: { instructions: { orderBy: { position: 'asc' } } },
    }),
    // This member's sessions only. Counting the owner's would leave the second
    // student with no transcript at all.
    prisma.assignmentModuleSession.findMany({
      where: { documentId, membershipId, deletedAt: null },
      select: { assignmentModuleId: true },
    }),
  ]);

  if (modules.length === 0) return false;

  const have = new Set(existing.map((row) => row.assignmentModuleId));
  const missing = modules.filter((module) => !have.has(module.id));
  if (missing.length === 0) return false;

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        assignmentModuleSessions: {
          create: buildAssignmentModuleSessionCreateData(missing).map(
            (row) => ({
              ...row,
              membershipId,
            })
          ),
        },
      },
    });
  } catch (error) {
    // A second tab can provision the same member at the same time. The database
    // uniqueness contract makes one request the winner; the loser observes the
    // already-created sessions as success rather than surfacing a 500.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return false;
    }
    throw error;
  }

  return true;
}
