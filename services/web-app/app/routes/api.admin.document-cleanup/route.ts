import { type ActionFunctionArgs, type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { documentCleanupService } from '~/services/document-cleanup.server.js';

const CleanupSchema = z.object({
  retentionDays: z.coerce.number().min(1).max(365).optional(),
  action: z.enum(['cleanup', 'create-snapshots', 'stats']),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  
  // Verify admin access
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user.isAdmin) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Return storage statistics
  const stats = await documentCleanupService.getStorageStats();
  
  return dataResponse({
    stats,
    message: 'Document storage statistics',
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  
  // Verify admin access
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user.isAdmin) {
    return new Response('Unauthorized', { status: 403 });
  }

  const { error, data } = await parseFormData(request, CleanupSchema);
  if (error) return validationError(error);

  try {
    switch (data.action) {
      case 'cleanup':
        const cleanupResults = await documentCleanupService.cleanupOldDocumentHistory(
          data.retentionDays || 30
        );
        return dataResponse({
          success: true,
          action: 'cleanup',
          results: cleanupResults,
          message: `Cleanup completed. Deleted ${cleanupResults.operationsDeleted} operations, ${cleanupResults.versionsDeleted} versions, ${cleanupResults.snapshotsDeleted} snapshots.`,
        });

      case 'create-snapshots':
        const snapshotsCreated = await documentCleanupService.createMissingSnapshots();
        return dataResponse({
          success: true,
          action: 'create-snapshots',
          snapshotsCreated,
          message: `Created ${snapshotsCreated} missing snapshots.`,
        });

      case 'stats':
        const stats = await documentCleanupService.getStorageStats();
        return dataResponse({
          success: true,
          action: 'stats',
          stats,
          message: 'Storage statistics retrieved.',
        });

      default:
        return new Response('Invalid action', { status: 400 });
    }
  } catch (error) {
    console.error('Document cleanup error:', error);
    return new Response('Internal server error during cleanup', { status: 500 });
  }
}