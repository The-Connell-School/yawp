import { type Prisma } from '@app/prisma';

/**
 * "Is this document a live collaboration room?"
 *
 * One definition, shared by the token endpoint, the collaborative page loader and
 * the dual-write. Three copies of this rule would be three chances to widen one
 * and forget another — and the consequences differ in kind: a stale copy in the
 * token endpoint hands out access it should not, while a stale copy in the
 * dual-write silently stops persisting a group's work.
 *
 * A document qualifies only if it has an opened group, and that group's road is
 * permitted for its organization:
 *
 * - `assignment` — teacher-arranged group work. Needs the assignment's own toggle
 *   plus `Organization.collaborativeDraftsEnabled`.
 * - `student-share` — a student's own shared draft. Needs
 *   `Organization.studentDocumentSharingEnabled`, and no assignment at all, since
 *   these drafts are not tied to one.
 *
 * Every document that existed before collaborative drafts has no group, so it
 * matches neither branch and is never treated as a room.
 */
export function collaborationRoomWhere(): Prisma.DocumentWhereInput {
  return {
    group: { is: { openedAt: { not: null } } },
    OR: [
      {
        group: { is: { kind: 'assignment' } },
        assignment: { is: { collaborationEnabled: true } },
        membership: {
          is: { organization: { is: { collaborativeDraftsEnabled: true } } },
        },
      },
      {
        group: { is: { kind: 'student-share' } },
        membership: {
          is: { organization: { is: { studentDocumentSharingEnabled: true } } },
        },
      },
    ],
  };
}
