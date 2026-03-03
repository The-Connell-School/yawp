import { prisma } from '~/utils/db.server';

export class StudentDocumentCreationError extends Error {}

type CreateStudentDocumentInput = {
  profileId: string;
  studentCourseId: string;
  classId?: string | null;
  assignmentId?: string | null;
};

type CreatedStudentDocument = {
  documentId: string;
};

export async function createStudentDocumentForCourse(
  input: CreateStudentDocumentInput
): Promise<CreatedStudentDocument> {
  const firstCourseModule = await prisma.studentCourseModule.findFirst({
    where: {
      studentCourseId: input.studentCourseId,
      deletedAt: null,
    },
    orderBy: { position: 'asc' },
    include: {
      instructions: {
        orderBy: { position: 'asc' },
        include: { buttons: { orderBy: { position: 'asc' } } },
      },
    },
  });

  if (!firstCourseModule) {
    throw new StudentDocumentCreationError('No course modules for this course.');
  }

  const firstInstruction = firstCourseModule.instructions[0];

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

  const resolvedClassId = input.classId ?? studentProfile.classes[0]?.id;

  const document = await prisma.document.create({
    data: {
      profileId: input.profileId,
      text: '',
      html: '',
      title: '',
      ...(resolvedClassId ? { classId: resolvedClassId } : {}),
      ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
      studentCourseModuleSessions: {
        create: {
          studentProfileId: studentProfile.id,
          instructionsCompleted: 0,
          studentCourseModuleId: firstCourseModule.id,
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
