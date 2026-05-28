import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isApEssayType } from '~/domain/grading/ap-rubric';

// Starts (or returns the existing) timed practice session for a document.
// The reading-phase lock and countdown derive from startedAt on the client.
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();
  const documentId = formData.get('documentId')?.toString();
  const essayType = formData.get('essayType')?.toString();

  if (!documentId) {
    return dataResponse(
      { success: false, message: 'documentId is required.' },
      { status: 400 }
    );
  }

  // Only the document owner can start a timed session on it.
  const document = await prisma.document.findFirst({
    where: { id: documentId, profileId: profile.id, deletedAt: null },
    select: { id: true, timedSession: true },
  });

  if (!document) {
    return dataResponse(
      { success: false, message: 'Document not found.' },
      { status: 404 }
    );
  }

  if (intent === 'submit') {
    if (document.timedSession && !document.timedSession.submittedAt) {
      await prisma.timedSession.update({
        where: { documentId },
        data: { submittedAt: new Date() },
      });
    }
    return dataResponse({ success: true });
  }

  // Default intent: start. Idempotent — returns the existing session if any.
  if (document.timedSession) {
    return dataResponse({
      success: true,
      timedSession: {
        essayType: document.timedSession.essayType,
        startedAt: document.timedSession.startedAt.toISOString(),
        submittedAt: document.timedSession.submittedAt?.toISOString() ?? null,
      },
    });
  }

  if (!essayType || !isApEssayType(essayType)) {
    return dataResponse(
      { success: false, message: 'A valid essayType is required to start.' },
      { status: 400 }
    );
  }

  const created = await prisma.timedSession.create({
    data: {
      documentId,
      essayType,
      startedAt: new Date(),
    },
  });

  return dataResponse({
    success: true,
    timedSession: {
      essayType: created.essayType,
      startedAt: created.startedAt.toISOString(),
      submittedAt: null,
    },
  });
}
