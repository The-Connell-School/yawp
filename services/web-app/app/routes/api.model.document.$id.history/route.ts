import { invariant } from '@epic-web/invariant';
import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { documentOperationManager } from '~/utils/document-operations.server.js';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariant(params.id, 'No document id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const url = new URL(request.url);
  const version = parseInt(url.searchParams.get('version') || '0');
  const q = url.searchParams.get('q')?.toLowerCase() ?? '';

  // Verify user has access to this document
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      ...(user.isAdmin
        ? {}
        : {
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
          }),
    },
    select: {
      id: true,
      currentVersion: true,
      operations: {
        select: {
          id: true,
          createdAt: true,
          type: true,
          position: true,
          content: true,
          length: true,
          batchId: true,
          version: true,
        },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        take: 50, // Limit to recent operations
      },
      snapshots: {
        select: {
          id: true,
          createdAt: true,
          version: true,
        },
        orderBy: { version: 'desc' },
        take: 10, // Recent snapshots
      },
    },
  });

  if (!document) {
    return new Response(null, { status: 404 });
  }

  // If a specific version is requested, reconstruct the document at that version
  if (version > 0) {
    try {
      const historicalDocument =
        await documentOperationManager.getDocumentAtVersion(params.id, version);
      return dataResponse({
        document: historicalDocument,
        version,
        currentVersion: document.currentVersion,
      });
    } catch (error) {
      return new Response('Error retrieving document version', { status: 500 });
    }
  }

  // Return summary of available versions and operations, optionally filtered by query.
  // When a query is present, perform a broader DB search so results are useful.
  let recentOperations: any[] = (document as any).operations;
  if (q) {
    recentOperations = await prisma.documentOperation.findMany({
      where: {
        documentId: document.id,
        content: { contains: q, mode: 'insensitive' },
      },
      select: {
        id: true,
        createdAt: true,
        type: true,
        position: true,
        content: true,
        length: true,
        batchId: true,
        version: true,
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  // Build recent version timestamp summaries for display (limit to most recent 500)
  const versionGroups = await prisma.documentOperation.groupBy({
    by: ['version'],
    where: { documentId: document.id },
    _max: { createdAt: true },
    orderBy: {
      version: 'desc',
    },
    take: 500,
  });
  const versionSummaries = versionGroups.map((g) => ({
    version: g.version,
    createdAt: g._max.createdAt,
  }));
  const computedCurrentVersion = Math.max(
    document.currentVersion ?? 0,
    versionSummaries[0]?.version ?? 0
  );

  return dataResponse({
    documentId: document.id,
    currentVersion: computedCurrentVersion,
    recentOperations,
    availableSnapshots: (document as any).snapshots,
    versionSummaries,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No document id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (request.method === 'POST') {
    // Trigger cleanup of old operations
    try {
      await documentOperationManager.cleanupOldOperations(params.id);
      return dataResponse({ success: true, message: 'Cleanup completed' });
    } catch (error) {
      return new Response('Error during cleanup', { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
