import { invariant } from '@epic-web/invariant';
import { type Prisma } from '@app/prisma';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const POST = z.object({
  documentId: z.string(),
  content: z.string(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile) {
    return dataResponse({ error: 'Profile not found.' }, { status: 404 });
  }

  const where: Prisma.DocumentCommentWhereUniqueInput = {
    id: params.id,
    OR: [
      { profileId: profile.id },
      {
        profile: {
          studentProfile: {
            class: { teachers: { some: { profileId: profile.id } } },
          },
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
