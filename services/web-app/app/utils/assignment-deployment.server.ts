import type { Prisma } from '@app/prisma';
import { deleteAssignmentPromptAttachment } from '~/domain/assignments/assignment-prompt-attachment.server';
import { prisma } from '~/utils/db.server';

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
  const deployment = await prisma.classAssignment.findFirst({
    where: {
      assignmentId: params.assignmentId,
      classId: params.classId,
    },
    select: {
      id: true,
      assignment: { select: { promptAttachmentKey: true } },
    },
  });

  if (!deployment) {
    return null;
  }

  await prisma.classAssignment.delete({ where: { id: deployment.id } });

  const remaining = await prisma.classAssignment.count({
    where: { assignmentId: params.assignmentId },
  });

  if (remaining === 0) {
    await prisma.assignment.delete({ where: { id: params.assignmentId } });
    if (deployment.assignment.promptAttachmentKey) {
      await deleteAssignmentPromptAttachment(
        deployment.assignment.promptAttachmentKey
      ).catch(() => {});
    }
  }

  return deployment.id;
}
