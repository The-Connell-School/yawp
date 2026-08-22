import { type Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';

/**
 * "Is this document a live collaboration room?"
 *
 * One definition, shared by the token endpoint, the collaborative page loader and
 * the dual-write. Three copies of this rule would be three chances to widen one
 * and forget another — and the consequences differ in kind: a stale copy in the
 * token endpoint hands out access it should not, while a stale copy in the
 * dual-write silently stops persisting a group's work.
 *
 * A document qualifies only if it has an opened group, its assignment type opts
 * into collaboration, and its group's road is permitted:
 *
 * - `assignment` — teacher-arranged group work. Needs the assignment's own toggle.
 * - `student-share` — a student's own shared draft, which has no assignment at all.
 *
 * `AssignmentType.collaborationSupported` is the prototype gate and applies to both
 * roads. It replaces the organization-level flags in this predicate: those default
 * to false, which is right for a real rollout but made the feature invisible
 * everywhere including preview. Scoping to one assignment type keeps the pilot
 * narrow while letting it actually be seen.
 *
 * Every document that existed before collaborative drafts has no group, so it
 * matches neither branch and is never treated as a room.
 */
export function collaborationRoomWhere(): Prisma.DocumentWhereInput {
  return {
    group: { is: { openedAt: { not: null } } },
    assignmentType: { is: { collaborationSupported: true } },
    OR: [
      {
        group: { is: { kind: 'assignment' } },
        assignment: { is: { collaborationEnabled: true } },
      },
      { group: { is: { kind: 'student-share' } } },
    ],
  };
}

/**
 * "Is this particular document a room?", asked by code outside the feature.
 *
 * The solo submit endpoint is the caller that matters: it scopes to a document's
 * owner, and a group draft has a nominal owner — `Document.membershipId` names
 * whoever the row was created for. Without this check that one student (or a
 * teacher acting for them) could hand the group's draft in through the old path,
 * and the rule that every member presses first would hold only in the UI.
 *
 * Deliberately the same predicate rather than a second reading of it.
 */
export async function isCollaborationRoom(
  documentId: string
): Promise<boolean> {
  const room = await prisma.document.findFirst({
    where: { id: documentId, ...collaborationRoomWhere() },
    select: { id: true },
  });
  return Boolean(room);
}
