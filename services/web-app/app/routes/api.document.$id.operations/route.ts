import { type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { invariant } from '@epic-web/invariant';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const OperationSchema = z.object({
  position: z.number(),
  type: z.enum(['insert', 'delete', 'format', 'undo', 'redo']),
  content: z.string().optional(),
  range: z.object({ from: z.number(), to: z.number() }).optional(),
  attributes: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const CreateOperationsSchema = z.object({
  operations: z.array(OperationSchema),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id found');
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const latest = url.searchParams.get('latest');

  // Check if user has access to this document
  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        { user: { studentProfile: { workshopLeaderId: userId } } },
      ],
    },
  });

  if (!document) {
    return Response.json({ error: 'Document not found' }, { status: 404 });
  }

  if (latest === '1') {
    // Get the latest operation for position initialization
    const latestOperation = await prisma.documentOperation.findFirst({
      where: { documentId: params.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return Response.json({ position: latestOperation?.position || 0 });
  }

  // Get all operations for the document
  const operations = await prisma.documentOperation.findMany({
    where: { documentId: params.id },
    orderBy: { position: 'asc' },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return Response.json({ operations });
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No document id found');
  const userId = await requireUserId(request);

  // Check if user has access to this document
  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        { user: { studentProfile: { workshopLeaderId: userId } } },
      ],
    },
  });

  if (!document) {
    return Response.json({ error: 'Document not found' }, { status: 404 });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { operations } = CreateOperationsSchema.parse(body);
    
    // Create operations in batch
    const createdOperations = await prisma.documentOperation.createMany({
      data: operations.map((op) => ({
        ...op,
        id: undefined, // Let Prisma generate the ID
        documentId: params.id,
        userId,
        range: op.range ? JSON.stringify(op.range) : null,
        attributes: op.attributes ? JSON.stringify(op.attributes) : null,
        metadata: op.metadata ? JSON.stringify(op.metadata) : null,
      })),
    });

    // Check if we need to create a snapshot (every 200 operations)
    const totalOperations = await prisma.documentOperation.count({
      where: { documentId: params.id },
    });

    if (totalOperations % 200 === 0) {
      await createSnapshot(params.id);
    }

    return Response.json({ 
      success: true, 
      count: createdOperations.count,
      shouldCreateSnapshot: totalOperations % 200 === 0
    });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

async function createSnapshot(documentId: string) {
  try {
    // Get current document state
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { html: true, text: true },
    });

    // Get latest operation
    const latestOperation = await prisma.documentOperation.findFirst({
      where: { documentId },
      orderBy: { position: 'desc' },
    });

    if (document && latestOperation) {
      await prisma.documentSnapshot.create({
        data: {
          documentId,
          operationId: latestOperation.id,
          html: document.html || '',
          text: document.text || '',
        },
      });
    }
  } catch (error) {
    console.error('Failed to create snapshot:', error);
  }
}