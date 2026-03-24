import { createHash } from 'node:crypto';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

const POST = z.object({ versionId: z.string() });

function hashString(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const actionImpl = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  // Try version first, then snapshot by id
  const version = await prisma.documentVersion.findFirst({
    where: { id: data.versionId, document: { profile: { userId } } },
    include: { document: true },
  });
  const snapshot = version
    ? null
    : await prisma.documentSnapshot.findFirst({
        where: { id: data.versionId, document: { profile: { userId } } },
        include: { document: true },
      });

  const journalEntry =
    version || snapshot
      ? null
      : await prisma.documentWriteJournal.findFirst({
          where: { id: data.versionId, document: { profile: { userId } } },
          include: { document: true },
        });

  if (!version && !snapshot && !journalEntry) {
    return redirectWithToast('/app', {
      description: 'Document version not found.',
      type: 'error',
    });
  }

  const sourceRecord = version ?? snapshot ?? journalEntry;

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.restore',
      source: 'restore-document-version',
      status: 'pending',
      userId,
      documentId: sourceRecord!.documentId,
      title: sourceRecord!.document.title,
      html: sourceRecord!.html,
      text: sourceRecord!.text,
      htmlHash: hashString(sourceRecord!.html),
      textHash: hashString(sourceRecord!.text),
      baseRevision: sourceRecord!.document.revision,
      metadata: {
        method: request.method,
        restoredFromId: data.versionId,
        restoredFromType: version ? 'version' : snapshot ? 'snapshot' : 'journal',
      },
    },
  });

  if (
    sourceRecord &&
    sourceRecord.document.html &&
    sourceRecord.document.text
  ) {
    await prisma.documentVersion.create({
      data: {
        documentId: sourceRecord!.documentId,
        html: sourceRecord!.document.html,
        text: sourceRecord!.document.text,
      },
    });
  }

  try {
    const doc = await prisma.document.update({
      where: { id: sourceRecord!.documentId },
      data: {
        html: sourceRecord!.html,
        text: sourceRecord!.text,
        revision: { increment: 1 },
      },
    });

    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'accepted',
        resultingRevision: doc.revision,
      },
    });

    return dataResponse({ doc });
  } catch (error) {
    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'rejected',
        failureReason:
          error instanceof Error ? error.message : 'document_restore_failed',
      },
    });
    throw error;
  }
};

export async function action(args: ActionFunctionArgs) {
  return actionImpl(args);
}
