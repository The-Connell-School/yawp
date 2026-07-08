import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';

export class DocumentCreationError extends Error {}

type CreateDocumentInput = {
  membershipId: string;
  assignmentTypeId: string;
  assignmentId?: string | null;
  classAssignmentId?: string | null;
  apHistorySnapshot?: unknown;
};

type CreatedDocument = {
  documentId: string;
};

export async function createDocumentForAssignmentType(
  input: CreateDocumentInput
): Promise<CreatedDocument> {
  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: input.assignmentTypeId, archivedAt: null },
    select: { id: true },
  });

  if (!assignmentType) {
    throw new DocumentCreationError('AssignmentType is not available.');
  }

  const assignmentModules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId: input.assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: {
        orderBy: { position: 'asc' },
        include: { buttons: { orderBy: { position: 'asc' } } },
      },
    },
  });

  if (assignmentModules.length === 0) {
    throw new DocumentCreationError('No modules for this AssignmentType.');
  }

  if (input.assignmentId || input.classAssignmentId) {
    const assignment = input.classAssignmentId
      ? await prisma.classAssignment.findUnique({
          where: { id: input.classAssignmentId },
          select: {
            assignmentId: true,
            assignment: { select: { assignmentTypeId: true } },
          },
        })
      : null;

    if (input.classAssignmentId) {
      if (!assignment) {
        throw new DocumentCreationError(
          `ClassAssignment ${input.classAssignmentId} not found`
        );
      }
      if (assignment.assignment.assignmentTypeId !== input.assignmentTypeId) {
        throw new DocumentCreationError(
          `ClassAssignment assignment type does not match input.assignmentTypeId`
        );
      }
      if (
        input.assignmentId &&
        input.assignmentId !== assignment.assignmentId
      ) {
        throw new DocumentCreationError(
          'assignmentId does not match ClassAssignment.assignmentId'
        );
      }
    }

    const templateAssignment = await prisma.assignment.findUnique({
      where: { id: input.assignmentId ?? assignment?.assignmentId },
      select: { assignmentTypeId: true },
    });
    if (!templateAssignment) {
      throw new DocumentCreationError(
        `Assignment ${input.assignmentId ?? assignment?.assignmentId} not found`
      );
    }
    if (templateAssignment.assignmentTypeId !== input.assignmentTypeId) {
      throw new DocumentCreationError(
        `Assignment.assignmentTypeId (${templateAssignment.assignmentTypeId}) does not match input.assignmentTypeId (${input.assignmentTypeId})`
      );
    }
  }

  const document = await prisma.document.create({
    data: {
      membershipId: input.membershipId,
      text: '',
      html: '',
      title: '',
      assignmentTypeId: input.assignmentTypeId,
      ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
      ...(input.classAssignmentId
        ? { classAssignmentId: input.classAssignmentId }
        : {}),
      ...(input.apHistorySnapshot
        ? {
            apHistorySnapshot: input.apHistorySnapshot as Prisma.InputJsonValue,
          }
        : {}),
      assignmentModuleSessions: {
        create: assignmentModules.map((assignmentModule) => {
          const firstInstruction = assignmentModule.instructions[0];
          return {
            instructionsCompleted: 0,
            assignmentModuleId: assignmentModule.id,
            ...(firstInstruction
              ? {
                  messages: {
                    create: [
                      {
                        content: firstInstruction.prompt,
                        agent: 'assistant',
                        instructionId: firstInstruction.id,
                      },
                    ],
                  },
                }
              : {}),
          };
        }),
      },
    },
    select: { id: true },
  });

  return { documentId: document.id };
}
