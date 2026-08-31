import { prisma } from '~/utils/db.server';

export class AssignmentArtifactError extends Error {}

class ArtifactClaimLost extends Error {}

/**
 * Creates the one assignment-owned artifact for a teacher-created group.
 *
 * This deliberately does not call the solo document factory: it has no student
 * owner, does not deduplicate against any member's private work, and does not
 * create an owner-style tutor transcript. Member tutor sessions are provisioned
 * lazily and privately when each student opens the artifact.
 *
 * The create and group claim share one transaction. If another request wins the
 * conditional claim, throwing rolls the newly-created document back instead of
 * deleting or orphaning either request's artifact.
 */
export async function createAssignmentGroupArtifact({
  groupId,
}: {
  groupId: string;
}): Promise<{ documentId: string; created: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const group = await tx.documentGroup.findUnique({
        where: { id: groupId },
        select: {
          id: true,
          documentId: true,
          classAssignment: {
            select: {
              id: true,
              assignmentId: true,
              assignment: {
                select: {
                  assignmentTypeId: true,
                  collaborationEnabled: true,
                  title: true,
                },
              },
            },
          },
          members: {
            where: { removedAt: null },
            select: { id: true },
          },
        },
      });

      if (!group)
        throw new AssignmentArtifactError('Document group not found.');
      if (!group.classAssignment) {
        throw new AssignmentArtifactError(
          'A collaborative artifact must belong to a class assignment.'
        );
      }
      if (!group.classAssignment.assignment.collaborationEnabled) {
        throw new AssignmentArtifactError(
          'This assignment is not set up for collaborative drafts.'
        );
      }
      if (group.members.length === 0) {
        throw new AssignmentArtifactError(
          'A collaborative artifact requires at least one active group member.'
        );
      }
      if (group.documentId) {
        return { documentId: group.documentId, created: false };
      }

      const document = await tx.document.create({
        data: {
          artifactKind: 'ASSIGNMENT_GROUP',
          membershipId: null,
          text: '',
          html: '',
          title: group.classAssignment.assignment.title ?? '',
          assignmentTypeId: group.classAssignment.assignment.assignmentTypeId,
          assignmentId: group.classAssignment.assignmentId,
          classAssignmentId: group.classAssignment.id,
        },
        select: { id: true },
      });

      const claimed = await tx.documentGroup.updateMany({
        where: { id: group.id, documentId: null },
        data: { documentId: document.id, openedAt: new Date() },
      });

      if (claimed.count !== 1) throw new ArtifactClaimLost();
      return { documentId: document.id, created: true };
    });
  } catch (error) {
    if (!(error instanceof ArtifactClaimLost)) throw error;

    const winner = await prisma.documentGroup.findUnique({
      where: { id: groupId },
      select: { documentId: true },
    });
    if (!winner?.documentId) {
      throw new AssignmentArtifactError(
        'The collaborative artifact could not be claimed.'
      );
    }
    return { documentId: winner.documentId, created: false };
  }
}
