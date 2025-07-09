import { type LoaderFunctionArgs } from 'react-router';
import { invariant } from '@epic-web/invariant';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id found');
  const userId = await requireUserId(request);

  // Check if user has access to this document
  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        { user: { studentProfile: { workshopLeaderId: userId } } },
      ],
    },
  });

  if (!document) {
    return Response.json({ error: 'Document not found' }, { status: 404 });
  }

  // Get the latest operation for position initialization
  const latestOperation = await prisma.documentOperation.findFirst({
    where: { documentId: params.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return Response.json({ position: latestOperation?.position || 0 });
}