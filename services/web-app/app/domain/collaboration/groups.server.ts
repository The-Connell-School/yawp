// Persistence for collaborative draft groups. The planning arithmetic lives in
// `groups.ts`; this module talks to the database.

import { prisma } from '~/utils/db.server';
import { createDocumentForAssignmentType } from '~/domain/documents.server';
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
  const classAssignment = await prisma.classAssignment.findUnique({
    where: { id: classAssignmentId },
    select: {
      id: true,
      class: { select: { students: { select: { id: true }, orderBy: { id: 'asc' } } } },
      documentGroups: { select: { id: true, openedAt: true } },
    },
  });

  if (!classAssignment) {
    throw new GroupProvisioningError('Class assignment not found.');
  }

  if (classAssignment.documentGroups.some((group) => group.openedAt !== null)) {
    throw new GroupProvisioningError(
      'Groups have already been opened for this assignment and cannot be rearranged.'
    );
  }

  const rosterIds = classAssignment.class.students.map((student) => student.id);
  const ordered = shuffle ? shuffleMemberships(rosterIds, random) : rosterIds;
  const planned = planGroups({ membershipIds: ordered, groupSize });

  await prisma.$transaction(async (tx) => {
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
  });

  return { groupCount: planned.length };
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
export async function openGroups({ classAssignmentId }: { classAssignmentId: string }) {
  const classAssignment = await prisma.classAssignment.findUnique({
    where: { id: classAssignmentId },
    select: {
      id: true,
      assignmentId: true,
      assignment: {
        select: { assignmentTypeId: true, collaborationEnabled: true },
      },
      documentGroups: {
        orderBy: { ordinal: 'asc' },
        select: {
          id: true,
          documentId: true,
          openedAt: true,
          members: {
            where: { removedAt: null },
            select: { membershipId: true },
            orderBy: { membershipId: 'asc' },
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

  let provisioned = 0;

  for (const group of classAssignment.documentGroups) {
    // Already has a draft: leave it alone. This is the idempotency guarantee.
    if (group.documentId) continue;

    if (group.members.length === 0) {
      // An empty group would produce a document nobody can open, since
      // Document.membershipId has to be someone.
      continue;
    }

    // The lowest membership id becomes the nominal owner. Deterministic on
    // purpose: Document.membershipId is required and single-valued, so one member
    // has to hold it, and a stable choice keeps repeated runs identical. Everyone
    // else reaches the draft through the group, which is what documentAuthorWhere
    // checks.
    const ownerMembershipId = group.members[0].membershipId;

    const created = await createDocumentForAssignmentType({
      membershipId: ownerMembershipId,
      assignmentTypeId: classAssignment.assignment.assignmentTypeId,
      assignmentId: classAssignment.assignmentId,
      classAssignmentId: classAssignment.id,
    });

    // Guarded update: only claim the group if it still has no document, so two
    // concurrent opens cannot both attach one.
    const claimed = await prisma.documentGroup.updateMany({
      where: { id: group.id, documentId: null },
      data: { documentId: created.documentId, openedAt: new Date() },
    });

    if (claimed.count === 0) {
      // Another request won the race. Drop the document we just made rather than
      // leaving it orphaned and invisible.
      await prisma.document.delete({ where: { id: created.documentId } });
      continue;
    }

    provisioned += 1;
  }

  return { provisioned };
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
