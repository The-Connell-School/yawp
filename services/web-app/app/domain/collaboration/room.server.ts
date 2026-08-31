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
 * A document qualifies only if it is explicitly an assignment-group artifact,
 * has an opened teacher-created group, and both its assignment and assignment
 * type opt into collaboration.
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
    artifactKind: 'ASSIGNMENT_GROUP',
    group: { is: { openedAt: { not: null } } },
    assignmentType: { is: { collaborationSupported: true } },
    assignment: { is: { collaborationEnabled: true } },
  };
}
