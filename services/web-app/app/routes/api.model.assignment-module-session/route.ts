import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import {
  requireMembership,
  requireMutableRequest,
  requireUserId,
} from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { isApHistorySnapshot } from '~/domain/ap-history/schema';
import { resolveApHistoryInstructionPrompt } from '../../../../../packages/prisma/scripts/ap-history-module-data';

const POST = z.object({
  assignmentModuleId: z.string(),
  documentId: z.string(),
});

function cmsInclude() {
  return {
    messages: {
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    },
    assignmentModule: {
      include: {
        instructions: {
          orderBy: { position: 'asc' as const },
          include: { buttons: { orderBy: { position: 'asc' as const } } },
        },
        assignmentType: {
          select: {
            assignmentModules: {
              select: { id: true, position: true },
              orderBy: { position: 'asc' as const },
            },
          },
        },
      },
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const [document, assignmentModule] = await Promise.all([
    prisma.document.findFirst({
      where: { id: data.documentId, membershipId: profile.id },
      select: {
        membershipId: true,
        assignmentTypeId: true,
        assignment: {
          select: { tutorEnabled: true, apHistorySnapshot: true },
        },
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

  if (assignmentModule.assignmentTypeId !== document.assignmentTypeId) {
    return dataResponse(
      { error: 'No assignment module found.' },
      { status: 404 }
    );
  }
  if (document.assignment?.tutorEnabled === false) {
    return dataResponse(
      { error: 'Tutor is disabled for this assignment.' },
      { status: 403 }
    );
  }

  if (!document.membershipId) {
    return dataResponse(
      { error: 'No student membership found.' },
      { status: 404 }
    );
  }

  const existing = await prisma.assignmentModuleSession.findFirst({
    where: {
      documentId: data.documentId,
      assignmentModuleId: data.assignmentModuleId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (existing) {
    const touched = await prisma.assignmentModuleSession.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });
    const cms = await prisma.assignmentModuleSession.findUnique({
      where: { id: existing.id },
      include: cmsInclude(),
    });
    return dataResponse({ created: touched, cms });
  }

  const firstInstruction = assignmentModule.instructions[0];
  const apHistorySnapshot = document.assignment?.apHistorySnapshot;
  const firstInstructionContent =
    firstInstruction && isApHistorySnapshot(apHistorySnapshot)
      ? (resolveApHistoryInstructionPrompt(
          apHistorySnapshot.essayType,
          assignmentModule.title,
          firstInstruction.title
        ) ?? firstInstruction.prompt)
      : firstInstruction?.prompt;
  const createdAt = new Date();
  const updatedAt = new Date(createdAt.getTime() + 1);
  const created = await prisma.assignmentModuleSession.create({
    data: {
      ...data,
      createdAt,
      updatedAt,
      instructionsCompleted: 0,
      assignmentModuleId: assignmentModule.id,
      ...(firstInstruction && {
        messages: {
          create: [
            {
              content: firstInstructionContent ?? firstInstruction.prompt,
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
    include: cmsInclude(),
  });

  return dataResponse({ created, cms });
}
