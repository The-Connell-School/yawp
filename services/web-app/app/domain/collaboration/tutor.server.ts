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
 * So sessions on a shared draft carry a `membershipId` and solo sessions keep
 * theirs null, meaning "the document's owner". That is what makes this additive:
 * no existing row changes, and no existing query has to learn anything.
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
 * `ownerMembershipId` is the document's own `membershipId` — the student a
 * pre-share transcript belongs to. It is needed because the null rows on a
 * document that has just become a shared draft are not orphans: they are that
 * student's conversation, written before anyone else was in the room.
 */
export async function ensureMemberModuleSessions({
  documentId,
  assignmentTypeId,
  membershipId,
  ownerMembershipId,
}: {
  documentId: string;
  assignmentTypeId: string;
  membershipId: string;
  ownerMembershipId?: string | null;
}): Promise<boolean> {
  // A student can share a draft they have been working on for days, tutor and
  // all. Those sessions carry a null membershipId, which meant "the document's
  // owner" right up until the document acquired other authors — from then on
  // nothing matches them and the student's own history vanishes from their own
  // page. Naming the owner on the rows makes them findable again.
  //
  // Deliberately before the count below, not alongside it: counting first would
  // see this member with no sessions and create a second, empty set beside the
  // one it was about to adopt.
  if (ownerMembershipId && ownerMembershipId === membershipId) {
    await prisma.assignmentModuleSession.updateMany({
      where: { documentId, membershipId: null, deletedAt: null },
      data: { membershipId },
    });
  }

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

  await prisma.document.update({
    where: { id: documentId },
    data: {
      assignmentModuleSessions: {
        create: buildAssignmentModuleSessionCreateData(missing).map((row) => ({
          ...row,
          membershipId,
        })),
      },
    },
  });

  return true;
}
