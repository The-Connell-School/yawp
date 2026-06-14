import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return dataResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  const body = await request.json();
  const { documentId, textLength, content } = body;

  if (!documentId || typeof textLength !== 'number') {
    return dataResponse({ error: 'Invalid request' }, { status: 400 });
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      membershipId: membership.id,
    },
  });

  if (!document) {
    return dataResponse({ error: 'Document not found' }, { status: 404 });
  }

  await prisma.pasteAlert.create({
    data: {
      documentId,
      membershipId: membership.id,
      textLength,
      content: content || null,
    },
  });

  return dataResponse({ success: true });
}
