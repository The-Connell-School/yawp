import type { Prisma } from '@app/prisma';
import { deleteAssignmentPromptAttachment } from '~/domain/assignments/assignment-prompt-attachment.server';
import { lockClassAssignmentCollaboration } from '~/domain/collaboration/class-assignment-lock.server';
import { prisma } from '~/utils/db.server';

export class AssignmentHasCollaborativeWorkError extends Error {}

export async function createAssignmentDeployedToClasses(params: {
  data: Omit<
    Prisma.AssignmentUncheckedCreateInput,
    'id' | 'createdAt' | 'updatedAt'
  >;
  classIds: string[];
  /**
   * Optional deployment fields applied to every created ClassAssignment row.
   * When provided, these values are set identically for each target class.
   */
  deployment?: {
    postAt?: Date | null;
    dueAt?: Date | null;
  };
}) {
  const uniqueClassIds = [...new Set(params.classIds)];
  const assignment = await prisma.assignment.create({
    data: params.data,
  });

  if (uniqueClassIds.length > 0) {
    await prisma.classAssignment.createMany({
      data: uniqueClassIds.map((classId) => ({
        assignmentId: assignment.id,
        classId,
        postAt: params.deployment?.postAt ?? null,
        dueAt: params.deployment?.dueAt ?? null,
      })),
    });
  }

  return assignment;
}

export async function deleteClassAssignmentDeployment(params: {
  assignmentId: string;
  classId: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const deployment = await tx.classAssignment.findFirst({
      where: {
        assignmentId: params.assignmentId,
        classId: params.classId,
      },
      select: {
        id: true,
        assignment: { select: { promptAttachmentKey: true } },
      },
    });

    if (!deployment) return null;

    await lockClassAssignmentCollaboration(tx, deployment.id);
    const sharedWork = await tx.documentGroup.findFirst({
      where: { classAssignmentId: deployment.id, documentId: { not: null } },
      select: { id: true },
    });
    if (sharedWork) {
      throw new AssignmentHasCollaborativeWorkError(
        'This assignment has shared group work and cannot be deleted.'
      );
    }

    await tx.classAssignment.delete({ where: { id: deployment.id } });
    const remaining = await tx.classAssignment.count({
      where: { assignmentId: params.assignmentId },
    });
    if (remaining === 0) {
      await tx.assignment.delete({ where: { id: params.assignmentId } });
    }

    return {
      id: deployment.id,
      attachmentKey:
        remaining === 0 ? deployment.assignment.promptAttachmentKey : null,
    };
  });

  if (result?.attachmentKey) {
    await deleteAssignmentPromptAttachment(result.attachmentKey).catch(
      () => {}
    );
  }

  return result?.id ?? null;
}
