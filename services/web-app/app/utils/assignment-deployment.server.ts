import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';

export async function createAssignmentDeployedToClasses(params: {
  data: Omit<
    Prisma.AssignmentUncheckedCreateInput,
    'id' | 'createdAt' | 'updatedAt'
  >;
  classIds: string[];
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
    select: { id: true },
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
  }

  return deployment.id;
}
