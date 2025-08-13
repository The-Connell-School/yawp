import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { getProfileId } from '~/cookies/profile-id.server';

const validator = z.object({
  commentId: z.string(),
  content: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profileId = await getProfileId(request);
  const profile = await prisma.profile.findUnique({
    where: { id: profileId, userId },
    select: { id: true },
  });

  if (!profile) {
    return dataResponse({ error: 'Profile not found.' }, { status: 404 });
  }

  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const creation = await prisma.documentCommentResponse.create({
    data: { ...data, profileId: profile.id },
  });

  return dataResponse(creation, { status: 201 });
}
