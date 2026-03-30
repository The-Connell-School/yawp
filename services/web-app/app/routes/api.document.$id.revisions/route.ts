import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
  const skip = (page - 1) * limit;

  const revisions = await prisma.documentRevision.findMany({
    where: { documentId: params.id },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      createdAt: true,
      trigger: true,
      html: true,
      text: true,
    },
  });

  return dataResponse({ revisions });
};
