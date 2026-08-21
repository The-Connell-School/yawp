import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  documentCommentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';

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

  // Stamping membershipId proves who wrote the reply, not that they may post into this
  // thread. Resolve the parent comment under the caller's read scope -- the owning
  // student or a teacher of a class that student is in. This also turns an unknown
  // commentId into a 404 instead of an unhandled foreign-key 500.
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: data.commentId,
      ...documentCommentReadWhere({
        profileId: profile.id,
        isAdmin: await getIsPlatformAdmin(userId),
      }),
    },
    select: { id: true },
  });

  if (!comment) {
    return dataResponse({ error: 'Comment not found.' }, { status: 404 });
  }

  const creation = await prisma.documentCommentResponse.create({
    data: { ...data, commentId: comment.id, membershipId: profile.id },
    include: {
      membership: { include: { user: { select: { name: true } } } },
    },
  });

  return dataResponse(creation, { status: 201 });
}
