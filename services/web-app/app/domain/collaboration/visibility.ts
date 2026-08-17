import { type Prisma } from '@app/prisma';

/**
 * "May this student see this assignment yet?"
 *
 * A collaborative assignment is not startable until its teacher has arranged
 * groups and opened them — before that there is no document for the student to
 * open. Rather than showing the assignment and refusing the click, it is hidden
 * until the group this student is actually in exists and is open.
 *
 * Both halves matter. `openedAt` alone would show the assignment to a student
 * their teacher left out of every group, who would then click into nothing; the
 * membership clause scopes it to a group that has room for *them*.
 *
 * Solo assignments are unaffected: every assignment that predates collaborative
 * drafts has `collaborationEnabled` false and matches the first branch, so this
 * filter is a no-op for all of them.
 */
export function studentVisibleClassAssignmentWhere(
  membershipId: string
): Prisma.ClassAssignmentWhereInput {
  return {
    OR: [
      { assignment: { is: { collaborationEnabled: false } } },
      {
        documentGroups: {
          some: {
            openedAt: { not: null },
            members: { some: { membershipId, removedAt: null } },
          },
        },
      },
    ],
  };
}
