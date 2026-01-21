import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

const POST = z.object({ documentId: z.string() });

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

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

  // Create a snapshot of the current document state
  const snapshot = await prisma.documentSnapshot.create({
    data: {
      documentId: document.id,
      html: document.html,
      text: document.text,
    },
  });

  // Update the document with submission information
  const submittedDocument = await prisma.document.update({
    where: { id: document.id },
    data: {
      submittedAt: new Date(),
      submittedSnapshotId: snapshot.id,
    },
  });

  return dataResponse({
    success: true,
    document: submittedDocument,
    message: document.submittedAt ? 'Essay resubmitted successfully!' : 'Essay submitted successfully!',
  });
}
