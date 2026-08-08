import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { documentGroupWhere } from '~/utils/document-access.server';

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

  // Group-scoped, not owner-scoped. The client fires this and ignores the response
  // (`.catch(() => {})` in use-paste-alert.ts), so an owner-only gate does not surface an
  // error to a collaborator — it drops their pastes on the floor and the plagiarism
  // detector goes dark for exactly the students most likely to be pasting a teammate's
  // work in. The alert row stamps membershipId as well as documentId, so widening the
  // gate keeps attribution: the alert still lands under whoever actually pasted.
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      ...documentGroupWhere({ profileId: membership.id }),
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
