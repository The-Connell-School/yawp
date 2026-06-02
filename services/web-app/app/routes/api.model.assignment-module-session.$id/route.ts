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

function sortInstructionsByPosition<T extends { position?: number | null }>(
  instructions: T[]
) {
  return instructions
    .map((instruction, index) => ({ instruction, index }))
    .sort((a, b) => {
      const aPosition = a.instruction.position;
      const bPosition = b.instruction.position;
      if (typeof aPosition === 'number' && typeof bPosition === 'number') {
        return aPosition === bPosition
          ? a.index - b.index
          : aPosition - bPosition;
      }
      if (typeof aPosition === 'number') return -1;
      if (typeof bPosition === 'number') return 1;
      return a.index - b.index;
    })
    .map(({ instruction }) => instruction);
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'Missing cms id');
  await requireUserId(request);
  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const cms = await prisma.assignmentModuleSession.findUnique({
    where: { id: params.id },
    include: {
      assignmentModule: {
        include: {
          instructions: {
            orderBy: { position: 'asc' },
            include: { buttons: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  });

  if (!cms) {
    return dataResponse(
      { error: 'No assignment module session found.' },
      { status: 404 }
    );
  }

  const instructions = sortInstructionsByPosition(
    cms.assignmentModule.instructions
  );
  const instructionsLength = instructions.length;
  const currentInstruction = instructions[cms.instructionsCompleted];
  const nextInstructionRecord = instructions[cms.instructionsCompleted + 1];

  const isIncrementing =
    typeof data.instructionsCompleted === 'object' &&
    'increment' in data.instructionsCompleted;

  const hasCompletedAllInstructions =
    cms.instructionsCompleted >= instructionsLength;
  const canCreateMessages =
    isIncrementing &&
    !hasCompletedAllInstructions &&
    currentInstruction &&
    nextInstructionRecord;

  const clampedInstructionsCompleted =
    typeof data.instructionsCompleted === 'number'
      ? Math.max(
          0,
          Math.min(data.instructionsCompleted, instructionsLength)
        )
      : undefined;

  const updateData: Record<string, unknown> = {
    ...omit(data, ['incrementButtonText']),
    ...(clampedInstructionsCompleted !== undefined
      ? { instructionsCompleted: clampedInstructionsCompleted }
      : {}),
    ...(canCreateMessages
      ? {
          messages: {
            createMany: {
              data: [
                {
                  content: data.incrementButtonText ?? 'Ready!',
                  agent: 'user',
                  instructionId: currentInstruction.id,
                },
                {
                  content: nextInstructionRecord.prompt,
                  agent: 'assistant',
                  instructionId: nextInstructionRecord.id,
                },
              ],
            },
          },
        }
      : {}),
  };

  await prisma.assignmentModuleSession.update({
    where: { id: params.id },
    data: updateData,
  });

  const updatedCms = await prisma.assignmentModuleSession.findUnique({
    where: { id: params.id },
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

  return dataResponse({ cms: updatedCms }, { status: 200 });
}
