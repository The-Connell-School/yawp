import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const validator = z.object({
  id: z.string(),
  documentId: z.string(),
  content: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile) {
    return dataResponse({ error: 'Profile not found.' }, { status: 404 });
  }

  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const creation = await prisma.documentComment.create({
    data: { ...data, profileId: profile.id },
    include: {
      profile: { include: { user: { select: { name: true } } } },
      responses: {
        include: {
          profile: { include: { user: { select: { name: true } } } },
        },
      },
    },
  });
  return dataResponse(creation, { status: 201 });
}
