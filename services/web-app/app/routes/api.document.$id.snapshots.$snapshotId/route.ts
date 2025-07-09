import { type LoaderFunctionArgs } from 'react-router';
import { invariant } from '@epic-web/invariant';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id found');
  invariant(params.snapshotId, 'No snapshot id found');
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

  // Get the specific snapshot
  const snapshot = await prisma.documentSnapshot.findUnique({
    where: { 
      id: params.snapshotId,
      documentId: params.id,
    },
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

  if (!snapshot) {
    return Response.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  return Response.json(snapshot);
}