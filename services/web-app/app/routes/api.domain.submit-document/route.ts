import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import { FEATURE_FLAGS, getFeatureFlag } from '~/utils/feature-flags.server';

const POST = z.object({ documentId: z.string() });

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  // Check if document submission is enabled
  const isSubmissionEnabled = await getFeatureFlag(
    FEATURE_FLAGS.DOCUMENT_SUBMISSION
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/courses', {
      description: 'Document submission is currently disabled.',
      type: 'error',
    });
  }

  // Verify the document exists and belongs to the user
  const document = await prisma.document.findFirst({
    where: {
      id: data.documentId,
      profile: { userId },
      deletedAt: null,
    },
    select: {
      id: true,
      html: true,
      text: true,
      title: true,
      submittedAt: true,
    },
  });

  if (!document) {
    return redirectWithToast('/app/courses', {
      description: 'Document not found.',
      type: 'error',
    });
  }

  if (!document.html || !document.text) {
    return redirectWithToast(`/app/documents/${data.documentId}`, {
      description: 'Cannot submit an empty document.',
      type: 'error',
    });
  }

  const html = document.html;
  const text = document.text;
  const now = new Date();

  const finalDocument = await prisma.$transaction(async (tx) => {
    const snapshot = await tx.documentSnapshot.create({
      data: {
        documentId: document.id,
        html,
        text,
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

  return dataResponse({
    success: true,
    document: finalDocument,
    message: document.submittedAt
      ? 'Essay resubmitted successfully!'
      : 'Essay submitted successfully!',
  });
}
