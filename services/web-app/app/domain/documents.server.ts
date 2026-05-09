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
  const firstAssignmentModule = await prisma.assignmentModule.findFirst({
    where: { assignmentTypeId: input.assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: {
        orderBy: { position: 'asc' },
        include: { buttons: { orderBy: { position: 'asc' } } },
      },
    },
  });

  if (!firstAssignmentModule) {
    throw new DocumentCreationError('No modules for this AssignmentType.');
  }

  const firstInstruction = firstAssignmentModule.instructions[0];

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
      throw new DocumentCreationError(`Assignment ${input.assignmentId} not found`);
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
        create: {
          instructionsCompleted: 0,
          assignmentModuleId: firstAssignmentModule.id,
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
        },
      },
    },
    select: { id: true },
  });

  return { documentId: document.id };
}
