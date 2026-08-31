// Hand-editing a group arrangement: move one student, add a group, remove an
// empty one. `arrangeGroups` in `groups.server.ts` replaces the whole
// arrangement from a shuffle; these are the adjustments a teacher makes to the
// result of that.
//
// Every operation shares one precondition — groups must not be opened yet. Once
// a group owns a draft its students have written in, moving someone between
// groups moves them between documents holding real content, so the boundary is
// enforced here rather than only hidden in the UI.

import type { Prisma } from '@app/prisma';
import { MAX_COLLABORATION_GROUP_SIZE } from '~/domain/assignments/collaboration';
import { prisma } from '~/utils/db.server';
import { lockClassAssignmentCollaboration } from './class-assignment-lock.server';
import { groupLabel } from './groups';

export class GroupEditingError extends Error {}

/**
 * Loads the roster and current arrangement, refusing anything already opened.
 *
 * Shared by all three operations because they share every guard: the class
 * assignment has to exist, and its groups have to still be editable.
 */
async function loadEditableArrangement(
  tx: Prisma.TransactionClient,
  classAssignmentId: string
) {
  const classAssignment = await tx.classAssignment.findUnique({
    where: { id: classAssignmentId },
    select: {
      id: true,
      class: {
        select: { students: { select: { id: true }, orderBy: { id: 'asc' } } },
      },
      documentGroups: {
        orderBy: { ordinal: 'asc' },
        select: {
          id: true,
          ordinal: true,
          openedAt: true,
          members: {
            where: { removedAt: null },
            select: { membershipId: true },
          },
        },
      },
    },
  });

  if (!classAssignment) {
    throw new GroupEditingError('Class assignment not found.');
  }

  if (classAssignment.documentGroups.some((group) => group.openedAt !== null)) {
    throw new GroupEditingError(
      'Groups have already been opened for this assignment and cannot be rearranged.'
    );
  }

  return classAssignment;
}

/**
 * Moves one student into one group, or out of every group when `targetGroupId`
 * is null (the unassigned bucket).
 *
 * Expressed as a move rather than a "save this whole layout" so that one drop is
 * one request: the teacher's other drops cannot be undone by a stale layout
 * arriving late, and a dropped request costs one student's placement rather than
 * the whole arrangement.
 */
export async function moveStudentToGroup({
  classAssignmentId,
  membershipId,
  targetGroupId,
}: {
  classAssignmentId: string;
  membershipId: string;
  targetGroupId: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await lockClassAssignmentCollaboration(tx, classAssignmentId);
    const classAssignment = await loadEditableArrangement(
      tx,
      classAssignmentId
    );

    const onRoster = classAssignment.class.students.some(
      (student) => student.id === membershipId
    );
    if (!onRoster) {
      throw new GroupEditingError('That student is not in this class.');
    }

    const target = targetGroupId
      ? classAssignment.documentGroups.find(
          (group) => group.id === targetGroupId
        )
      : null;

    // The group id arrives from the browser, so being on this page is not proof it
    // names a group on this page.
    if (targetGroupId && !target) {
      throw new GroupEditingError('That group is not part of this assignment.');
    }

    const alreadyThere = target?.members.some(
      (member) => member.membershipId === membershipId
    );
    if (alreadyThere) return { moved: false as const };

    // Dropping an unassigned student back into the unassigned bucket.
    const currentlyAssigned = classAssignment.documentGroups.some((group) =>
      group.members.some((member) => member.membershipId === membershipId)
    );
    if (!target && !currentlyAssigned) return { moved: false as const };

    if (target && target.members.length >= MAX_COLLABORATION_GROUP_SIZE) {
      throw new GroupEditingError(
        `A group can hold at most ${MAX_COLLABORATION_GROUP_SIZE} students.`
      );
    }

    // Leave first, then join. A student belongs to exactly one group per class
    // assignment, and doing it in this order means a failure between the two
    // leaves them unassigned rather than in two groups at once.
    await tx.documentGroupMember.updateMany({
      where: {
        membershipId,
        removedAt: null,
        group: { classAssignmentId },
      },
      data: { removedAt: new Date() },
    });

    if (target) {
      // Upsert, not create: [groupId, membershipId] is unique, so a student
      // dragged back into a group they were previously removed from would
      // collide with their own soft-removed row.
      await tx.documentGroupMember.upsert({
        where: {
          groupId_membershipId: { groupId: target.id, membershipId },
        },
        create: { groupId: target.id, membershipId },
        update: { removedAt: null },
      });
    }
    return { moved: true as const };
  });
}

/**
 * Adds an empty group, so there is somewhere to drag people to.
 *
 * Ordinals are never reused. `[classAssignmentId, ordinal]` is unique, and
 * filling a gap left by a deleted group would collide the moment two were
 * deleted and re-added.
 */
export async function addGroup({
  classAssignmentId,
}: {
  classAssignmentId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockClassAssignmentCollaboration(tx, classAssignmentId);
    const classAssignment = await loadEditableArrangement(
      tx,
      classAssignmentId
    );

    const nextOrdinal = classAssignment.documentGroups.reduce(
      (highest, group) => Math.max(highest, group.ordinal + 1),
      0
    );

    const created = await tx.documentGroup.create({
      data: {
        classAssignmentId,
        ordinal: nextOrdinal,
        label: groupLabel(nextOrdinal),
      },
      select: { id: true, label: true },
    });

    return { groupId: created.id, label: created.label };
  });
}

/**
 * Deletes a group nobody is in.
 *
 * Only empty ones. Deleting a populated group would silently unassign its
 * students — the teacher should drag them out first, so they can see where
 * everyone ended up rather than discovering it at the unassigned bucket.
 */
export async function removeEmptyGroup({
  classAssignmentId,
  groupId,
}: {
  classAssignmentId: string;
  groupId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockClassAssignmentCollaboration(tx, classAssignmentId);
    const classAssignment = await loadEditableArrangement(
      tx,
      classAssignmentId
    );

    const group = classAssignment.documentGroups.find(
      (candidate) => candidate.id === groupId
    );
    if (!group) {
      throw new GroupEditingError('That group is not part of this assignment.');
    }
    if (group.members.length > 0) {
      throw new GroupEditingError(
        'That group still has students in it. Move them out first.'
      );
    }

    await tx.documentGroup.delete({ where: { id: groupId } });

    return { removed: true as const };
  });
}
