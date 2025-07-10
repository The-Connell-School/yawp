import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const PUT = z.object({
  text: z.string().optional(),
  html: z.string().optional(),
  title: z.string().optional(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);

  if (request.method === 'DELETE') {
    const updated = await prisma.document.update({
      where: { id: params.id, userId },
      data: { deletedAt: new Date() },
    });

    if (!updated) {
      return new Response(null, { status: 404 });
    } else {
      return new Response(null, { status: 204 });
    }
  }

  const { error, data } = await parseFormData(request, PUT);
  if (error) return validationError(error);

  const [user, document] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isAdmin: true },
    }),
    prisma.document.findUniqueOrThrow({
      where: { id: params.id },
    }),
  ]);

  await prisma.documentVersion.create({
    data: {
      documentId: params.id,
      text: document.text ?? '',
      html: document.html ?? '',
    },
  });

  const update = await prisma.document.update({
    where: {
      id: document.id,
      ...(user.isAdmin
        ? {}
        : {
            OR: [
              { userId },
              { user: { studentProfile: { workshopLeaderId: userId } } },
            ],
          }),
    },
    data,
  });

  if (!update) {
    return new Response(null, { status: 404 });
  } else {
    return new Response(null, { status: 204 });
  }
}
