import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const POST = z.object({
  assignmentModuleId: z.string(),
  documentId: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const [document, assignmentModule] = await Promise.all([
    prisma.document.findUnique({
      where: { id: data.documentId },
      select: {
        studentProfileId: true,
      },
    }),
    prisma.assignmentModule.findUnique({
      where: { id: data.assignmentModuleId },
      include: { instructions: true },
    }),
  ]);

  if (!assignmentModule) {
    return dataResponse(
      { error: 'No assignment module found.' },
      { status: 404 }
    );
  } else if (!document) {
    return dataResponse({ error: 'No document found.' }, { status: 404 });
  }

  if (!document.studentProfileId) {
    return dataResponse(
      { error: 'No student profile found.' },
      { status: 404 }
    );
  }

  const firstInstruction = assignmentModule.instructions[0];
  const created = await prisma.assignmentModuleSession.create({
    data: {
      ...data,
      instructionsCompleted: 0,
      assignmentModuleId: assignmentModule.id,
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

  const cms = await prisma.assignmentModuleSession.findUnique({
    where: { id: created.id },
    include: {
      messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      assignmentModule: {
        include: {
          instructions: {
            orderBy: { position: 'asc' },
            include: { buttons: { orderBy: { position: 'asc' } } },
          },
          assignmentType: {
            select: {
              assignmentModules: {
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
