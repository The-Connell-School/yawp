import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const validator = z.object({
  commentId: z.string(),
  content: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  const creation = await prisma.documentCommentResponse.create({
    data: { ...data, userId },
  });

  return dataResponse(creation, { status: 201 });
}
