import { prisma } from '~/utils/db.server';

export class DocumentCreationError extends Error {}

type CreateDocumentInput = {
  profileId: string;
  assignmentTypeId: string;
  assignmentId?: string | null;
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

  let studentProfile = await prisma.studentProfile.findUnique({
    where: { profileId: input.profileId },
    include: { classes: true },
  });

  if (!studentProfile) {
    studentProfile = await prisma.studentProfile.create({
      data: { profileId: input.profileId },
      include: { classes: true },
    });
  }

  if (input.assignmentId) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: input.assignmentId },
      select: { assignmentTypeId: true },
    });
    if (!assignment) {
      throw new DocumentCreationError(
        `Assignment ${input.assignmentId} not found`
      );
    }
    if (assignment.assignmentTypeId !== input.assignmentTypeId) {
      throw new DocumentCreationError(
        `Assignment.assignmentTypeId (${assignment.assignmentTypeId}) does not match input.assignmentTypeId (${input.assignmentTypeId})`
      );
    }
  }

  const document = await prisma.document.create({
    data: {
      profileId: input.profileId,
      studentProfileId: studentProfile.id,
      text: '',
      html: '',
      title: '',
      assignmentTypeId: input.assignmentTypeId,
      ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
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
