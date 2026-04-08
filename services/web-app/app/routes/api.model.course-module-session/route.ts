import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const POST = z.object({
  studentCourseModuleId: z.string(),
  documentId: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const [document, courseModule] = await Promise.all([
    prisma.document.findUnique({
      where: { id: data.documentId },
      select: {
        profile: { select: { studentProfile: { select: { id: true } } } },
      },
    }),
    prisma.studentCourseModule.findUnique({
      where: { id: data.studentCourseModuleId },
      include: { instructions: true },
    }),
  ]);

  if (!courseModule) {
    return dataResponse({ error: 'No course module found.' }, { status: 404 });
  } else if (!document) {
    return dataResponse({ error: 'No document found.' }, { status: 404 });
  }

  if (!document.profile.studentProfile?.id) {
    return dataResponse(
      { error: 'No student profile found.' },
      { status: 404 }
    );
  }

  const firstInstruction = courseModule.instructions[0];
  const created = await prisma.studentCourseModuleSession.create({
    data: {
      ...data,
      instructionsCompleted: 0,
      studentCourseModuleId: courseModule.id,
      studentProfileId: document.profile.studentProfile.id,
      ...(firstInstruction && {
        messages: {
          create: [
            {
              content: firstInstruction.prompt,
              agent: 'assistant',
              instructionId: firstInstruction.id,
            },
          ],
        },
      }),
    },
  });

  const cms = await prisma.studentCourseModuleSession.findUnique({
    where: { id: created.id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      studentCourseModule: {
        include: {
          instructions: {
            orderBy: { position: 'asc' },
            include: { buttons: { orderBy: { position: 'asc' } } },
          },
          studentCourse: {
            select: {
              studentCourseModules: {
                select: { id: true, position: true },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      },
    },
  });

  return dataResponse({ created, cms });
}
