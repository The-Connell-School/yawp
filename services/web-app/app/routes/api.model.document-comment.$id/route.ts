import { invariant } from '@epic-web/invariant';
import { type Prisma } from '@app/prisma';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { getProfileId } from '~/cookies/profile-id.server';

const POST = z.object({
  documentId: z.string(),
  content: z.string(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profileId = await getProfileId(request);
  const profile = await prisma.profile.findUnique({
    where: { id: profileId, userId },
    select: { id: true },
  });

  if (!profile) {
    return dataResponse({ error: 'Profile not found.' }, { status: 404 });
  }

  const where: Prisma.DocumentCommentWhereUniqueInput = {
    id: params.id,
    OR: [
      { profileId },
      {
        profile: {
          studentProfile: { class: { teachers: { some: { profileId } } } },
        },
      },
    ],
  };

  if (request.method === 'DELETE') {
    await prisma.documentComment.delete({ where });
    return new Response(null, { status: 204 });
  }

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const updated = await prisma.documentComment.update({ where, data });

  if (!updated) {
    return new Response(null, { status: 404 });
  } else {
    return dataResponse(updated, { status: 201 });
  }
}
