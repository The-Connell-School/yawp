// Persistence for collaborative draft groups. The planning arithmetic lives in
// `groups.ts`; this module talks to the database.

import { prisma } from '~/utils/db.server';
import { createAssignmentGroupArtifactInTransaction } from './assignment-artifact.server';
import {
  lockClassAssignmentCollaboration,
  lockStudentRosters,
} from './class-assignment-lock.server';
import { groupLabel, planGroups, shuffleMemberships } from './groups';

export class GroupProvisioningError extends Error {}

/**
 * Replaces the group arrangement for one class assignment.
 *
 * Only legal before groups are opened. Once a group owns a draft that students
 * have written in, reshuffling would move people between documents that already
 * hold content — the caller must not offer it, and this refuses it outright so a
 * stale form post cannot do it either.
 *
 * Membership rows are soft-removed rather than deleted, so a student who was in
 * a group keeps that history.
 */
export async function arrangeGroups({
  classAssignmentId,
  groupSize,
  shuffle = false,
  random,
}: {
  classAssignmentId: string;
  groupSize: number | null;
  shuffle?: boolean;
  random?: () => number;
}) {
  return prisma.$transaction(async (tx) => {
    const roster = await tx.classAssignment.findUnique({
      where: { id: classAssignmentId },
      select: { class: { select: { students: { select: { id: true } } } } },
    });
    if (!roster) {
      throw new GroupProvisioningError('Class assignment not found.');
    }
    await lockStudentRosters(
      tx,
      roster.class.students.map(({ id }) => id)
    );
    if (!(await lockClassAssignmentCollaboration(tx, classAssignmentId))) {
      throw new GroupProvisioningError('Class assignment not found.');
    }
    const classAssignment = await tx.classAssignment.findUnique({
      where: { id: classAssignmentId },
      select: {
        id: true,
        class: {
          select: {
            students: { select: { id: true }, orderBy: { id: 'asc' } },
          },
        },
        documentGroups: { select: { id: true, openedAt: true } },
      },
    });

    if (!classAssignment) {
      throw new GroupProvisioningError('Class assignment not found.');
    }
    if (
      classAssignment.documentGroups.some((group) => group.openedAt !== null)
    ) {
      throw new GroupProvisioningError(
        'Groups have already been opened for this assignment and cannot be rearranged.'
      );
    }

    const rosterIds = classAssignment.class.students.map(
      (student) => student.id
    );
    const ordered = shuffle ? shuffleMemberships(rosterIds, random) : rosterIds;
    const planned = planGroups({ membershipIds: ordered, groupSize });

    // Unopened groups hold no documents, so clearing them loses nothing.
    await tx.documentGroup.deleteMany({
      where: { classAssignmentId, openedAt: null },
    });

    for (const [ordinal, membershipIds] of planned.entries()) {
      await tx.documentGroup.create({
        data: {
          classAssignmentId,
          ordinal,
          label: groupLabel(ordinal),
          members: {
            create: membershipIds.map((membershipId) => ({ membershipId })),
          },
        },
      });
    }
    return { groupCount: planned.length };
  });
}

/**
 * Opens groups to students: provisions one shared document per group and stamps
 * `openedAt`.
 *
 * **Idempotent**, which matters more here than anywhere else in this feature. A
 * double-clicked button, a retried request, or a second teacher opening the same
 * assignment must not create two documents for one group — a group whose draft is
 * replaced loses whatever the students wrote in the first one. Every group that
 * already has a document is left exactly as it is.
 */
export async function openGroups({
  classAssignmentId,
}: {
  classAssignmentId: string;
}) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockClassAssignmentCollaboration(tx, classAssignmentId))) {
      throw new GroupProvisioningError('Class assignment not found.');
    }
    const classAssignment = await tx.classAssignment.findUnique({
      where: { id: classAssignmentId },
      select: {
        id: true,
        assignmentId: true,
        assignment: {
          select: {
            assignmentTypeId: true,
            collaborationEnabled: true,
            collaborationGroupMode: true,
          },
        },
        class: { select: { students: { select: { id: true } } } },
        documentGroups: {
          orderBy: { ordinal: 'asc' },
          select: {
            id: true,
            documentId: true,
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
      throw new GroupProvisioningError('Class assignment not found.');
    }
    if (!classAssignment.assignment.collaborationEnabled) {
      throw new GroupProvisioningError(
        'This assignment is not set up for collaborative drafts.'
      );
    }
    if (classAssignment.documentGroups.length === 0) {
      throw new GroupProvisioningError('Arrange groups before opening them.');
    }
    if (
      classAssignment.assignment.collaborationGroupMode === 'whole-class' &&
      classAssignment.documentGroups.length !== 1
    ) {
      throw new GroupProvisioningError(
        'A whole-class assignment must have exactly one shared group.'
      );
    }

    // Finalization is the point at which the seating chart becomes durable
    // access control. Every enrolled student must appear in exactly one active
    // group; otherwise finalizing would either hide the assignment from someone
    // or give them access to two assignment-owned artifacts.
    const rosterIds = new Set(
      classAssignment.class.students.map((student) => student.id)
    );
    const assignmentCounts = new Map<string, number>();
    for (const group of classAssignment.documentGroups) {
      for (const member of group.members) {
        assignmentCounts.set(
          member.membershipId,
          (assignmentCounts.get(member.membershipId) ?? 0) + 1
        );
      }
    }

    const hasNonRosterMember = [...assignmentCounts.keys()].some(
      (membershipId) => !rosterIds.has(membershipId)
    );
    const hasMissingOrDuplicateRosterMember = [...rosterIds].some(
      (membershipId) => assignmentCounts.get(membershipId) !== 1
    );
    if (hasNonRosterMember || hasMissingOrDuplicateRosterMember) {
      throw new GroupProvisioningError(
        'Assign every enrolled student to exactly one group before finalizing.'
      );
    }

    let provisioned = 0;

    for (const group of classAssignment.documentGroups) {
      // Already has a draft: leave it alone. This is the idempotency guarantee.
      if (group.documentId) continue;

      if (group.members.length === 0) continue;

      const result = await createAssignmentGroupArtifactInTransaction(tx, {
        groupId: group.id,
      });
      if (result.created) provisioned += 1;
    }

    return { provisioned };
  });
}

/**
 * The group a student belongs to for one class assignment, if any. Used to send a
 * student to their own group's draft rather than creating a personal document.
 */
export async function findStudentGroupDocument({
  classAssignmentId,
  membershipId,
}: {
  classAssignmentId: string;
  membershipId: string;
}) {
  const group = await prisma.documentGroup.findFirst({
    where: {
      classAssignmentId,
      openedAt: { not: null },
      documentId: { not: null },
      members: { some: { membershipId, removedAt: null } },
    },
    select: { id: true, documentId: true },
  });

  return group?.documentId ? { documentId: group.documentId } : null;
}
