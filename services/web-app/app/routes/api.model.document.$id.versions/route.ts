import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No id provided');
  await requireUserId(request);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '5');
  const skip = (page - 1) * limit;
  const mode = url.searchParams.get('mode') || 'versions';

  let versions;

  if (mode === 'snapshots') {
    versions = await prisma.documentSnapshot.findMany({
      where: { documentId: params.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  } else if (mode === 'journal') {
    versions = await prisma.documentWriteJournal.findMany({
      where: { documentId: params.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        eventType: true,
        status: true,
        failureReason: true,
        title: true,
        html: true,
        text: true,
      },
    });
  } else {
    versions = await prisma.documentVersion.findMany({
      where: { documentId: params.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  return new Response(JSON.stringify(versions), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
