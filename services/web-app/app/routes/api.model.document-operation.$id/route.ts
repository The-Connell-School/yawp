import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const UPDATE = z.object({
  operationType: z.string().optional(),
  position: z.number().optional(),
  content: z.string().optional(),
  metadata: z.string().optional(),
  stackPosition: z.number().optional(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);

  if (request.method === 'PUT') {
    const { error, data } = await parseFormData(request, UPDATE);
    if (error) return validationError(error);

    // Check if user has access to this operation
    const operation = await prisma.documentOperation.findFirst({
      where: {
        id: params.id,
        OR: [
          { userId },
          { document: { userId } },
          { document: { user: { studentProfile: { workshopLeaderId: userId } } } },
        ],
      },
    });

    if (!operation) {
      return new Response(null, { status: 404 });
    }

    const updated = await prisma.documentOperation.update({
      where: { id: params.id },
      data,
    });

    return Response.json(updated);
  }

  if (request.method === 'DELETE') {
    // Check if user has access to this operation
    const operation = await prisma.documentOperation.findFirst({
      where: {
        id: params.id,
        OR: [
          { userId },
          { document: { userId } },
          { document: { user: { studentProfile: { workshopLeaderId: userId } } } },
        ],
      },
    });

    if (!operation) {
      return new Response(null, { status: 404 });
    }

    await prisma.documentOperation.delete({
      where: { id: params.id },
    });

    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 405 });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);

  const operation = await prisma.documentOperation.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        { document: { userId } },
        { document: { user: { studentProfile: { workshopLeaderId: userId } } } },
      ],
    },
    include: {
      document: true,
      user: { select: { id: true, name: true } },
    },
  });

  if (!operation) {
    return new Response(null, { status: 404 });
  }

  return Response.json(operation);
}