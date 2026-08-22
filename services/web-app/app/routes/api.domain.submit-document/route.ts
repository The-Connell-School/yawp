import { createHash } from 'node:crypto';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { isCollaborationRoom } from '~/domain/collaboration/room.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import { redirectWithToast } from '~/utils/toast.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';

const POST = z.object({ documentId: z.string(), title: z.string().optional() });

function hashString(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const document = await prisma.document.findFirst({
    where: {
      id: data.documentId,
      deletedAt: null,
      ...(hasEffectivePlatformAdmin(user?.isAdmin)
        ? {}
        : {
            OR: [
              { membershipId: profile.id },
              {
                membership: {
                  classesAsStudent: {
                    some: {
                      teachers: {
                        some: { id: profile.id },
                      },
                    },
                  },
                },
              },
            ],
          }),
    },
    select: {
      id: true,
      html: true,
      text: true,
      title: true,
      revision: true,
      classAssignment: {
        select: {
          class: {
            select: {
              id: true,
              schoolId: true,
              school: { select: { organizationId: true } },
              teachers: { select: { id: true } },
            },
          },
        },
      },
      membership: {
        select: {
          classesAsStudent: {
            select: {
              id: true,
              schoolId: true,
              school: { select: { organizationId: true } },
              teachers: { select: { id: true } },
            },
          },
        },
      },
      submissions: {
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!document) {
    return redirectWithToast('/app/courses', {
      description: 'Document not found.',
      type: 'error',
    });
  }

  // A shared draft is never submitted from here.
  //
  // This endpoint scopes to the document's owner, and a group draft has one —
  // `Document.membershipId` names whoever the row was created for. Left open,
  // that student, or a teacher acting for them, could hand the group's work in
  // without the rest of the group agreeing, which is exactly what the group
  // submit flow exists to prevent. Every document that predates collaborative
  // drafts has no group, so this matches none of them.
  if (await isCollaborationRoom(document.id)) {
    return redirectWithToast(`/app/collab-documents/${document.id}`, {
      description:
        'This is a shared draft. It goes to your teacher once everyone in your group has pressed Submit.',
      type: 'error',
    });
  }

  if (!isDocumentSubmittableContent(document.html ?? '', document.text ?? '')) {
    return redirectWithToast(`/app/documents/${data.documentId}`, {
      description: 'Cannot submit an empty document.',
      type: 'error',
    });
  }

  const html = document.html ?? '';
  const text = document.text ?? '';
  const now = new Date();

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.submit',
      source: 'submit-document',
      status: 'pending',
      userId,
      membershipId: profile.id,
      documentId: document.id,
      title: document.title,
      html,
      text,
      htmlHash: hashString(html),
      textHash: hashString(text),
      baseRevision: document.revision,
      metadata: {
        method: request.method,
        submittedAt: now.toISOString(),
      },
    },
  });

  try {
    const { submission: createdSubmission, document: finalDocument } =
      await prisma.$transaction(async (tx) => {
        const submission = await tx.submission.create({
          data: {
            documentId: document.id,
            title: data.title || (document.title ?? ''),
            html,
            text,
            submittedAt: now,
          },
          select: { id: true, title: true, submittedAt: true },
        });

        const doc = await tx.document.update({
          where: { id: document.id },
          data: {
            updatedAt: now,
          },
        });

        return { submission, document: doc };
      });

    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'accepted',
        resultingRevision: document.revision,
      },
    });

    return dataResponse({
      success: true,
      document: finalDocument,
      submission: createdSubmission,
      message: 'Essay submitted successfully!',
    });
  } catch (error) {
    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'rejected',
        failureReason:
          error instanceof Error ? error.message : 'submit_transaction_failed',
      },
    });
    throw error;
  }
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
