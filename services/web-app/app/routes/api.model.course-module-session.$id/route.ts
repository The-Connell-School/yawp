import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { zfd } from 'zod-form-data';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import omit from 'lodash/omit';

const validator = z.object({
  incrementButtonText: z.string().optional(),
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

  const cms = await prisma.studentCourseModuleSession.findUnique({
    where: { id: params.id },
    include: {
      studentCourseModule: {
        include: {
          instructions: {
            include: { buttons: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  });

  if (!cms) {
    return dataResponse(
      { error: 'No course module session found.' },
      { status: 404 }
    );
  }

  const nextInstruction = cms.instructionsCompleted + 1;
  const hasCompletedAllInstructions =
    nextInstruction === cms.studentCourseModule.instructions.length;

  const isIncrementing =
    typeof data.instructionsCompleted === 'object' &&
    'increment' in data.instructionsCompleted;

  const updated = await prisma.studentCourseModuleSession.update({
    where: { id: params.id },
    data: {
      ...omit(data, ['incrementButtonText']),
      ...(!hasCompletedAllInstructions && isIncrementing
        ? {
            messages: {
              createMany: {
                data: [
                  {
                    content: data.incrementButtonText ?? 'Ready!',
                    agent: 'user',
                    instructionId:
                      cms.studentCourseModule.instructions[
                        cms.instructionsCompleted
                      ].id,
                  },
                  {
                    content:
                      cms.studentCourseModule.instructions[nextInstruction]
                        .prompt,
                    agent: 'assistant',
                    instructionId:
                      cms.studentCourseModule.instructions[nextInstruction].id,
                  },
                ],
              },
            },
          }
        : {}),
    },
  });

  return dataResponse(updated, { status: 200 });
}
