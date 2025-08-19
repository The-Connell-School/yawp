import { prisma } from './db.server';

export type Operation = {
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
  sequence?: number;
};

export type OperationBatch = {
  operations: Operation[];
  batchId: string;
  version: number;
};

/**
 * Smart batching strategy for document operations
 * Groups operations that happen within a time window and are semantically related
 */
export class DocumentOperationManager {
  private pendingBatches = new Map<
    string,
    {
      operations: Operation[];
      batchId: string;
      lastActivity: Date;
      timer: NodeJS.Timeout;
    }
  >();

  // Configuration
  private readonly BATCH_TIMEOUT = 5000; // 5 seconds - much longer than current 200ms
  private readonly MAX_BATCH_SIZE = 50; // Maximum operations per batch
  private readonly SNAPSHOT_INTERVAL = 100; // Create snapshot every 100 versions

  /**
   * Add an operation to the batch for a document
   */
  async addOperation(documentId: string, operation: Operation): Promise<void> {
    const batch = this.pendingBatches.get(documentId);
    const now = new Date();

    if (!batch) {
      // Create new batch
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const timer = setTimeout(
        () => this.flushBatch(documentId),
        this.BATCH_TIMEOUT
      );

      this.pendingBatches.set(documentId, {
        operations: [operation],
        batchId,
        lastActivity: now,
        timer,
      });
    } else {
      // Add to existing batch
      batch.operations.push(operation);
      batch.lastActivity = now;

      // Flush if batch is getting too large
      if (batch.operations.length >= this.MAX_BATCH_SIZE) {
        await this.flushBatch(documentId);
      }
    }
  }

  /**
   * Flush pending operations for a document to the database
   */
  private async flushBatch(documentId: string): Promise<void> {
    const batch = this.pendingBatches.get(documentId);
    if (!batch || batch.operations.length === 0) return;

    try {
      // Get next version number
      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
        select: { currentVersion: true },
      });

      const nextVersion = document.currentVersion + 1;

      // Create operations in database
      await prisma.$transaction(async (tx) => {
        // Insert all operations in the batch
        await tx.documentOperation.createMany({
          data: batch.operations.map((op, index) => ({
            documentId,
            type: op.type,
            position: op.position,
            content: op.content,
            length: op.length,
            batchId: batch.batchId,
            version: nextVersion,
            sequence: index,
          })),
        });

        // Update document version
        await tx.document.update({
          where: { id: documentId },
          data: { currentVersion: nextVersion },
        });

        // Create snapshot if needed
        if (nextVersion % this.SNAPSHOT_INTERVAL === 0) {
          const currentDoc = await tx.document.findUniqueOrThrow({
            where: { id: documentId },
            select: { text: true, html: true },
          });

          await tx.documentSnapshot.create({
            data: {
              documentId,
              text: currentDoc.text || '',
              html: currentDoc.html || '',
              version: nextVersion,
            },
          });
        }
      });

      console.log(
        `Flushed batch ${batch.batchId} for document ${documentId}: ${batch.operations.length} operations`
      );
    } catch (error) {
      console.error('Error flushing document operations:', error);
    } finally {
      // Clean up
      clearTimeout(batch.timer);
      this.pendingBatches.delete(documentId);
    }
  }

  /**
   * Public: force flush for a specific document immediately (e.g., end of request)
   */
  async flushNow(documentId: string): Promise<void> {
    await this.flushBatch(documentId);
  }

  /**
   * Force flush all pending batches (useful for shutdown)
   */
  async flushAll(): Promise<void> {
    const promises = Array.from(this.pendingBatches.keys()).map((docId) =>
      this.flushBatch(docId)
    );
    await Promise.all(promises);
  }

  /**
   * Get document at a specific version by replaying operations
   */
  async getDocumentAtVersion(
    documentId: string,
    version: number
  ): Promise<{ text: string; html: string } | null> {
    // Find the latest snapshot before the target version
    const snapshot = await prisma.documentSnapshot.findFirst({
      where: {
        documentId,
        version: { lte: version },
      },
      orderBy: { version: 'desc' },
    });

    let baseText = '';
    let baseHtml = '';
    let startVersion = 0;

    if (snapshot) {
      baseText = snapshot.text;
      baseHtml = snapshot.html;
      startVersion = snapshot.version;
    }

    // Get all operations from start version to target version
    const operations = await prisma.documentOperation.findMany({
      where: {
        documentId,
        version: {
          gt: startVersion,
          lte: version,
        },
      },
      orderBy: [{ version: 'asc' }, { createdAt: 'asc' }],
    });

    // Apply operations to reconstruct the document
    let currentText = baseText;
    // Note: For simplicity, we're only tracking text. HTML reconstruction would be more complex

    // Group by version to avoid index-shift issues by applying deletes right-to-left, inserts left-to-right per version
    const versionToOps = new Map<number, typeof operations>();
    for (const op of operations) {
      const arr = versionToOps.get(op.version) ?? [];
      arr.push(op);
      versionToOps.set(op.version, arr);
    }

    for (const v of Array.from(versionToOps.keys()).sort((a, b) => a - b)) {
      const ops = versionToOps.get(v)!;
      const deletes = ops
        .filter((o) => o.type === 'delete')
        .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
      const inserts = ops
        .filter((o) => o.type === 'insert')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      for (const op of deletes) {
        if (op.length && op.position <= currentText.length) {
          const endPos = Math.min(op.position + op.length, currentText.length);
          currentText =
            currentText.slice(0, op.position) + currentText.slice(endPos);
        }
      }
      for (const op of inserts) {
        if (op.content && op.position <= currentText.length) {
          currentText =
            currentText.slice(0, op.position) +
            op.content +
            currentText.slice(op.position);
        }
      }
    }

    return {
      text: currentText,
      html: baseHtml, // Simplified - would need more complex HTML reconstruction
    };
  }

  /**
   * Clean up old operations based on retention policy
   */
  async cleanupOldOperations(documentId: string): Promise<void> {
    const retentionDays = 30; // Keep operations for 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Keep at least one snapshot and operations from the most recent snapshot
    const latestSnapshot = await prisma.documentSnapshot.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
    });

    let minVersionToKeep = 1;
    if (latestSnapshot && latestSnapshot.createdAt > cutoffDate) {
      minVersionToKeep = latestSnapshot.version;
    }

    // Delete old operations
    await prisma.documentOperation.deleteMany({
      where: {
        documentId,
        createdAt: { lt: cutoffDate },
        version: { lt: minVersionToKeep },
      },
    });

    // Delete old snapshots (keep at least the latest one)
    if (latestSnapshot) {
      await prisma.documentSnapshot.deleteMany({
        where: {
          documentId,
          createdAt: { lt: cutoffDate },
          version: { lt: latestSnapshot.version },
        },
      });
    }
  }
}

// Global instance
export const documentOperationManager = new DocumentOperationManager();

/**
 * Generate operations by comparing two text strings
 * This is a simplified diff algorithm
 */
export function generateOperations(
  oldText: string,
  newText: string
): Operation[] {
  if (oldText === newText) return [];

  // Common-prefix/suffix diff: produce at most one delete and one insert
  let start = 0;
  const oldLen = oldText.length;
  const newLen = newText.length;

  while (
    start < oldLen &&
    start < newLen &&
    oldText[start] === newText[start]
  ) {
    start++;
  }

  let endOld = oldLen - 1;
  let endNew = newLen - 1;
  while (
    endOld >= start &&
    endNew >= start &&
    oldText[endOld] === newText[endNew]
  ) {
    endOld--;
    endNew--;
  }

  const operations: Operation[] = [];

  const deleteLength = endOld - start + 1;
  if (deleteLength > 0) {
    operations.push({ type: 'delete', position: start, length: deleteLength });
  }

  const insertContent = newText.slice(start, endNew + 1);
  if (insertContent.length > 0) {
    operations.push({
      type: 'insert',
      position: start,
      content: insertContent,
    });
  }

  return operations;
}
