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

  // Get all snapshots for the document
  const snapshots = await prisma.documentSnapshot.findMany({
    where: { documentId: params.id },
    orderBy: { timestamp: 'desc' },
    include: {
      operation: {
        select: {
          id: true,
          position: true,
          type: true,
          timestamp: true,
        },
      },
    },
  });

  return Response.json({ snapshots });
}