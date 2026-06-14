import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const validator = z.object({
  commentId: z.string(),
  content: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (!profile) {
    return dataResponse({ error: 'Profile not found.' }, { status: 404 });
  }

  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const creation = await prisma.documentCommentResponse.create({
    data: { ...data, membershipId: profile.id },
    include: {
      membership: { include: { user: { select: { name: true } } } },
    },
  });

  return dataResponse(creation, { status: 201 });
}
