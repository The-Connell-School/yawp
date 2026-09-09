import { prisma } from '~/utils/db.server';
import {
  lockClassCollaborationDeployments,
  lockStudentRosters,
} from './class-assignment-lock.server';

/**
 * Replaces one student's class roster without racing collaborative-group
 * finalization. Leaving a class preserves the historical membership row while
 * withdrawing current access to every shared artifact deployed in that class.
 */
export async function replaceStudentClassRoster({
  membershipId,
  nextClassIds,
}: {
  membershipId: string;
  nextClassIds: string[];
}) {
  const next = new Set(nextClassIds);

  return prisma.$transaction(async (tx) => {
    await lockStudentRosters(tx, [membershipId]);
    const membership = await tx.orgMembership.findUnique({
      where: { id: membershipId },
      select: { classesAsStudent: { select: { id: true } } },
    });
    if (!membership) throw new Error('Student membership not found.');

    const current = new Set(membership.classesAsStudent.map(({ id }) => id));
    const affectedClassIds = [...new Set([...current, ...next])].sort();
    const removedClassIds = [...current].filter(
      (classId) => !next.has(classId)
    );

    for (const classId of affectedClassIds) {
      await lockClassCollaborationDeployments(tx, classId);
    }

    if (removedClassIds.length > 0) {
      await tx.documentGroupMember.updateMany({
        where: {
          membershipId,
          removedAt: null,
          group: {
            classAssignment: { classId: { in: removedClassIds } },
          },
        },
        data: { removedAt: new Date() },
      });
    }

    return tx.orgMembership.update({
      where: { id: membershipId },
      data: {
        classesAsStudent: {
          set: nextClassIds.map((id) => ({ id })),
        },
      },
    });
  });
}
