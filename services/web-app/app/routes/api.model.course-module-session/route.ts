import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const POST = z.object({
  courseModuleId: z.string(),
  documentId: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const [document, courseModule] = await Promise.all([
    prisma.document.findUnique({ where: { id: data.documentId } }),
    prisma.courseModule.findUnique({
      where: { id: data.courseModuleId },
      include: { instructions: true },
    }),
  ]);

  if (!courseModule) {
    return dataResponse({ error: 'No course module found.' }, { status: 404 });
  } else if (!document) {
    return dataResponse({ error: 'No document found.' }, { status: 404 });
  }

  const firstInstruction = courseModule.instructions[0];
  const created = await prisma.courseModuleSession.create({
    data: {
      ...data,
      instructionsCompleted: 0,
      userId: document.userId,
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

  return dataResponse({ created });
}
