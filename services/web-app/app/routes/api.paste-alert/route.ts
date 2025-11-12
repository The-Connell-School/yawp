import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return dataResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const body = await request.json();
  const { documentId, textLength } = body;

  if (!documentId || typeof textLength !== 'number') {
    return dataResponse({ error: 'Invalid request' }, { status: 400 });
  }

  // Verify the document belongs to the user
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      profileId: profile.id,
    },
  });

  if (!document) {
    return dataResponse({ error: 'Document not found' }, { status: 404 });
  }

  // Create the paste alert
  await prisma.pasteAlert.create({
    data: {
      documentId,
      profileId: profile.id,
      textLength,
    },
  });

  return dataResponse({ success: true });
}




