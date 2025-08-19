import { prisma } from '~/utils/db.server.js';
import { documentOperationManager } from '~/utils/document-operations.server.js';

/**
 * Document cleanup service for managing version history retention
 */
export class DocumentCleanupService {
  private readonly DEFAULT_RETENTION_DAYS = 30;
  private readonly BATCH_SIZE = 100;

  /**
   * Clean up old document operations and versions across all documents
   */
  async cleanupOldDocumentHistory(retentionDays: number = this.DEFAULT_RETENTION_DAYS): Promise<{
    operationsDeleted: number;
    versionsDeleted: number;
    snapshotsDeleted: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    console.log(`Starting document history cleanup - removing data older than ${cutoffDate.toISOString()}`);

    let totalOperationsDeleted = 0;
    let totalVersionsDeleted = 0;
    let totalSnapshotsDeleted = 0;

    // Process documents in batches
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const documents = await prisma.document.findMany({
        select: { id: true },
        skip: offset,
        take: this.BATCH_SIZE,
        where: { deletedAt: null }, // Only process active documents
      });

      if (documents.length === 0) {
        hasMore = false;
        continue;
      }

      // Clean up each document
      for (const doc of documents) {
        try {
          await documentOperationManager.cleanupOldOperations(doc.id);
          
          // Clean up old DocumentVersions (legacy system)
          const deletedVersions = await prisma.documentVersion.deleteMany({
            where: {
              documentId: doc.id,
              createdAt: { lt: cutoffDate },
            },
          });
          
          totalVersionsDeleted += deletedVersions.count;
          
        } catch (error) {
          console.error(`Error cleaning up document ${doc.id}:`, error);
        }
      }

      offset += this.BATCH_SIZE;
    }

    // Clean up operations and snapshots across all documents
    const [deletedOperations, deletedSnapshots] = await Promise.all([
      prisma.documentOperation.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      }),
      prisma.documentSnapshot.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          // Keep at least one snapshot per document
          documentId: {
            notIn: await prisma.documentSnapshot
              .groupBy({
                by: ['documentId'],
                _max: { version: true },
              })
              .then(groups => 
                Promise.all(groups.map(async (group) => {
                  const latest = await prisma.documentSnapshot.findFirst({
                    where: { 
                      documentId: group.documentId,
                      version: group._max.version,
                    },
                    select: { id: true },
                  });
                  return latest?.id;
                }))
              )
              .then(ids => ids.filter(Boolean) as string[])
          },
        },
      }),
    ]);

    totalOperationsDeleted = deletedOperations.count;
    totalSnapshotsDeleted = deletedSnapshots.count;

    console.log(`Document cleanup completed:
      - Operations deleted: ${totalOperationsDeleted}
      - Legacy versions deleted: ${totalVersionsDeleted} 
      - Snapshots deleted: ${totalSnapshotsDeleted}`);

    return {
      operationsDeleted: totalOperationsDeleted,
      versionsDeleted: totalVersionsDeleted,
      snapshotsDeleted: totalSnapshotsDeleted,
    };
  }

  /**
   * Create snapshots for documents that need them
   */
  async createMissingSnapshots(): Promise<number> {
    const SNAPSHOT_INTERVAL = 100; // Create snapshot every 100 versions
    let snapshotsCreated = 0;

    // Find documents that might need snapshots
    const documents = await prisma.document.findMany({
      select: {
        id: true,
        text: true,
        html: true,
        currentVersion: true,
      },
      where: {
        deletedAt: null,
        currentVersion: { gte: SNAPSHOT_INTERVAL },
      },
    });

    for (const doc of documents) {
      try {
        // Check if we have a recent snapshot
        const latestSnapshot = await prisma.documentSnapshot.findFirst({
          where: { documentId: doc.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });

        const shouldCreateSnapshot = !latestSnapshot || 
          (doc.currentVersion - latestSnapshot.version) >= SNAPSHOT_INTERVAL;

        if (shouldCreateSnapshot) {
          await prisma.documentSnapshot.create({
            data: {
              documentId: doc.id,
              text: doc.text || '',
              html: doc.html || '',
              version: doc.currentVersion,
            },
          });
          snapshotsCreated++;
        }
      } catch (error) {
        console.error(`Error creating snapshot for document ${doc.id}:`, error);
      }
    }

    console.log(`Created ${snapshotsCreated} missing snapshots`);
    return snapshotsCreated;
  }

  /**
   * Get statistics about document storage usage
   */
  async getStorageStats(): Promise<{
    totalDocuments: number;
    totalOperations: number;
    totalVersions: number;
    totalSnapshots: number;
    oldestOperation: Date | null;
    newestOperation: Date | null;
    averageOperationsPerDocument: number;
  }> {
    const [
      totalDocuments,
      totalOperations,
      totalVersions,
      totalSnapshots,
      operationStats,
    ] = await Promise.all([
      prisma.document.count({ where: { deletedAt: null } }),
      prisma.documentOperation.count(),
      prisma.documentVersion.count(),
      prisma.documentSnapshot.count(),
      prisma.documentOperation.aggregate({
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
    ]);

    return {
      totalDocuments,
      totalOperations,
      totalVersions,
      totalSnapshots,
      oldestOperation: operationStats._min.createdAt,
      newestOperation: operationStats._max.createdAt,
      averageOperationsPerDocument: totalDocuments > 0 ? totalOperations / totalDocuments : 0,
    };
  }
}

export const documentCleanupService = new DocumentCleanupService();