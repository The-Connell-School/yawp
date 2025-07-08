import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { zfd } from 'zod-form-data';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const validator = z.object({
  instructionsCompleted: z.union([
    z.object({ increment: zfd.numeric() }),
    z.object({ decrement: zfd.numeric() }),
    zfd.numeric(),
  ]),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'Missing cms id');
  await requireUserId(request);
  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const cms = await prisma.courseModuleSession.findUnique({
    where: { id: params.id },
    include: { courseModule: { include: { instructions: { include: { buttons: { orderBy: { position: 'asc' } } } } } } },
  });

  if (!cms) {
    return dataResponse(
      { error: 'No course module session found.' },
      { status: 404 }
    );
  }

  const hasCompletedAllInstructions =
    cms.instructionsCompleted + 1 === cms.courseModule.instructions.length;

  const isIncrementing =
    typeof data.instructionsCompleted === 'object' &&
    'increment' in data.instructionsCompleted;

  const updated = await prisma.courseModuleSession.update({
    where: { id: params.id },
    data: {
      ...data,
      ...(!hasCompletedAllInstructions && isIncrementing
        ? {
            messages: {
              create: {
                content:
                  cms.courseModule.instructions[cms.instructionsCompleted]
                    .prompt,
                agent: 'assistant',
                instructionId:
                  cms.courseModule.instructions[cms.instructionsCompleted].id,
              },
            },
          }
        : {}),
    },
  });

  return dataResponse(updated, { status: 200 });
}
