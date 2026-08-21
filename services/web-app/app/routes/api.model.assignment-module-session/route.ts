import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  documentOwnerWhere,
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';

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
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  // The caller has to be bound to the document in the body. Read scope gets them this
  // far -- teachers legitimately open a student's document and its tutor panel -- but
  // creating a session below is narrowed to the owner.
  const [document, assignmentModule] = await Promise.all([
    prisma.document.findFirst({
      where: {
        id: data.documentId,
        ...documentReadWhere({ profileId: profile.id, isAdmin }),
      },
      select: {
        id: true,
        membershipId: true,
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

  // Creating a session seeds an assistant message that shows up in the student's
  // editor, so only the student who owns the document (or a platform admin) may do it.
  // Expressed as a second scoped query rather than a field comparison so the rule stays
  // in the database predicate.
  const ownedDocument = await prisma.document.findFirst({
    where: {
      id: document.id,
      ...documentOwnerWhere({ profileId: profile.id, isAdmin }),
    },
    select: { id: true },
  });

  if (!ownedDocument) {
    return dataResponse(
      {
        error:
          'Only the student who owns this document can start a tutor session.',
      },
      { status: 403 }
    );
  }

  const firstInstruction = assignmentModule.instructions[0];
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
    include: cmsInclude(),
  });

  return dataResponse({ created, cms });
}
