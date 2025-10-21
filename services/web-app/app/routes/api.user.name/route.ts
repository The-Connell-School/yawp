import { type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { NameSchema } from '~/utils/schemas/user.js';

const Schema = z.object({
  name: NameSchema,
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, Schema);

  if (error) return validationError(error);

  await prisma.user.update({
    where: { id: userId },
    data: { name: data.name },
  });

  return new Response(null, { status: 204 });
}
