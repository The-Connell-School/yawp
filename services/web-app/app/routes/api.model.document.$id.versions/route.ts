import { invariant } from '@epic-web/invariant';
import { data, type LoaderFunctionArgs } from 'react-router';
import { auditLoader } from '~/utils/audit.server';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

async function loaderHandler({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No id provided');
  await requireUserId(request);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '5');
  const skip = (page - 1) * limit;
  const mode = url.searchParams.get('mode') || 'versions';

  const versions =
    mode === 'snapshots'
      ? await prisma.documentSnapshot.findMany({
          where: { documentId: params.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        })
      : await prisma.documentVersion.findMany({
          where: { documentId: params.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        });

  return new Response(JSON.stringify(versions), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const loader = auditLoader(loaderHandler);
