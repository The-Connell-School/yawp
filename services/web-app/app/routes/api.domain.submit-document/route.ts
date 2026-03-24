import { createHash } from 'node:crypto';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { isDocumentSubmissionEnabledForSchool } from '~/utils/feature-flags.server';

const POST = z.object({ documentId: z.string() });

function hashString(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
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
      ...(user?.isAdmin
        ? {}
        : {
            OR: [
              { profile: { id: profile.id } },
              {
                profile: {
                  studentProfile: {
                    classes: {
                      some: {
                        teachers: {
                          some: {
                            profileId: profile.id,
                          },
                        },
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
      submittedAt: true,
      revision: true,
      class: {
        select: {
          schoolId: true,
        },
      },
    },
  });

  if (!document) {
    return redirectWithToast('/app/courses', {
      description: 'Document not found.',
      type: 'error',
    });
  }

  if (document.submittedAt) {
    return redirectWithToast(`/app/documents/${data.documentId}`, {
      description: 'Resubmitting is temporarily disabled.',
      type: 'error',
    });
  }

  if (!document.html || !document.text) {
    return redirectWithToast(`/app/documents/${data.documentId}`, {
      description: 'Cannot submit an empty document.',
      type: 'error',
    });
  }

  const isSubmissionEnabled = await isDocumentSubmissionEnabledForSchool(
    document.class?.schoolId
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/courses', {
      description: 'Document submission is currently disabled for this school.',
      type: 'error',
    });
  }

  const html = document.html;
  const text = document.text;
  const now = new Date();

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.submit',
      source: 'submit-document',
      status: 'pending',
      userId,
      profileId: profile.id,
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
    const finalDocument = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.documentSnapshot.create({
        data: {
          documentId: document.id,
          title: document.title,
          html,
          text,
          submittedAt: now,
        },
      });

      await tx.documentComment.updateMany({
        where: { documentId: document.id, archivedAt: null },
        data: { archivedAt: now },
      });

      return tx.document.update({
        where: { id: document.id },
        data: {
          submittedAt: now,
          submittedSnapshotId: snapshot.id,
        },
      });
    });

    // Create permanent revision for history
    try {
      await prisma.documentRevision.create({
        data: {
          documentId: document.id,
          html: document.html ?? '',
          text: document.text ?? '',
          trigger: 'submit',
        },
      });
    } catch {
      // Revision creation is non-fatal
    }

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
