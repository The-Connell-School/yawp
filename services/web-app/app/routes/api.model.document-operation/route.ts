import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const CREATE = z.object({
  documentId: z.string(),
  operationType: z.string(),
  position: z.number(),
  content: z.string().optional(),
  metadata: z.string().optional(),
  stackPosition: z.number(),
});

const GET = z.object({
  documentId: z.string(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  if (request.method === 'POST') {
    const { error, data } = await parseFormData(request, CREATE);
    if (error) return validationError(error);

    // Check if user has access to the document
    const document = await prisma.document.findFirst({
      where: {
        id: data.documentId,
        OR: [
          { userId },
          { user: { studentProfile: { workshopLeaderId: userId } } },
        ],
      },
    });

    if (!document) {
      return new Response(null, { status: 404 });
    }

    const operation = await prisma.documentOperation.create({
      data: {
        ...data,
        userId,
      },
    });

    return Response.json(operation);
  }

  return new Response(null, { status: 405 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const documentId = url.searchParams.get('documentId');
  const limit = url.searchParams.get('limit');
  const offset = url.searchParams.get('offset');

  invariant(documentId, 'documentId is required');

  // Check if user has access to the document
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      OR: [
        { userId },
        { user: { studentProfile: { workshopLeaderId: userId } } },
      ],
    },
  });

  if (!document) {
    return new Response(null, { status: 404 });
  }

  const operations = await prisma.documentOperation.findMany({
    where: { documentId },
    orderBy: { createdAt: 'desc' },
    take: limit ? parseInt(limit) : 100,
    skip: offset ? parseInt(offset) : 0,
  });

  return Response.json(operations);
}