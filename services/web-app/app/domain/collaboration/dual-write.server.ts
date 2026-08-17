import { collaborationRoomWhere } from './room.server';
import { contentHash } from '~/utils/content-hash';
import { prisma } from '~/utils/db.server';
import type { DocumentSnapshot } from './snapshot';

/**
 * Dual-write: storing a collaborative draft's derived snapshot into the columns
 * the rest of Yawp reads.
 *
 * While a group is writing, the CRDT in the provider is the source of truth. But
 * grading, the tutor, search, comments, revision history and submission all read
 * `Document.html` / `Document.text`. Without this, a collaborative document looks
 * permanently empty to every one of them — and that exact omission is what got the
 * previous attempt in this subsystem reverted from main
 * (docs/decisions/2026-03-30-revert-local-first-persistence.md), so it is required
 * rather than nice to have.
 *
 * Deliberately NOT reusing `api.document.$id.save`. That route is single-writer
 * optimistic locking: it rejects a write whose `baseRevision` does not match. Here
 * there is nothing to conflict with — the CRDT already merged every concurrent
 * edit, and this is the only writer for a collaborative document because the
 * collaborative page never wires up autosave. Sending CRDT output through a
 * concurrency check designed for competing writers would reject valid state.
 */

/**
 * Matches `api.document.$id.save`'s interval so collaborative and solo documents
 * accumulate history at the same rate.
 */
const REVISION_INTERVAL_MS = 30 * 60 * 1000;

/** Triggers that always cut a revision, mirroring the solo save path. */
const EXPLICIT_TRIGGERS = new Set([
  'session-start',
  'session-end',
  'submit',
  'manual',
  'pre-submit-flush',
  'periodic',
]);

export type CollabDualWriteResult =
  | { status: 'written'; revision: number }
  | { status: 'unchanged'; revision: number }
  | { status: 'skipped'; reason: 'not-a-collaborative-document' };

/**
 * Writes a snapshot to a collaborative document.
 *
 * `membershipId` attributes the write when the provider tells us who caused it.
 * `DocumentWriteJournal` keeps that attribution, which is also what a future
 * contribution breakdown reads.
 */
export async function applyCollabSnapshot({
  documentId,
  snapshot,
  source = 'collab-webhook',
  trigger = 'auto',
  membershipId,
  requestId,
  metadata,
}: {
  documentId: string;
  snapshot: DocumentSnapshot;
  source?: string;
  trigger?: string;
  membershipId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<CollabDualWriteResult> {
  // Only ever write to a document that really is an opened collaborative draft.
  // A webhook naming an ordinary solo document must not be able to overwrite a
  // student's individual work.
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...collaborationRoomWhere() },
    select: { id: true, html: true, text: true, revision: true },
  });

  if (!document) {
    return { status: 'skipped', reason: 'not-a-collaborative-document' };
  }

  const incomingHash = await contentHash(snapshot.html, snapshot.text);
  const currentHash = await contentHash(document.html ?? '', document.text ?? '');

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.collab-snapshot',
      source,
      status: 'pending',
      documentId: document.id,
      membershipId: membershipId ?? null,
      requestId: requestId ?? null,
      baseRevision: document.revision,
      html: snapshot.html,
      text: snapshot.text,
      htmlHash: incomingHash,
      textHash: incomingHash,
      metadata: metadata ? (metadata as any) : undefined,
    },
    select: { id: true },
  });

  // Nothing changed. Common: presence-only activity, or a redelivered webhook.
  // Recorded as accepted rather than rejected so the journal does not read as a
  // stream of failures during ordinary editing.
  if (incomingHash === currentHash) {
    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'accepted',
        resultingRevision: document.revision,
        metadata: { ...(metadata ?? {}), noChange: true },
      },
    });
    return { status: 'unchanged', revision: document.revision };
  }

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      html: snapshot.html,
      text: snapshot.text,
      revision: { increment: 1 },
      updatedAt: new Date(),
    },
    select: { revision: true },
  });

  // Revision history, on the same throttle the solo path uses.
  const lastRevision = await prisma.documentRevision.findFirst({
    where: { documentId: document.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, html: true, text: true },
  });

  let shouldCreateRevision: boolean;
  if (!lastRevision) {
    shouldCreateRevision = true;
  } else if (EXPLICIT_TRIGGERS.has(trigger)) {
    const previousHash = await contentHash(lastRevision.html, lastRevision.text);
    shouldCreateRevision = previousHash !== incomingHash;
  } else {
    shouldCreateRevision =
      Date.now() - lastRevision.createdAt.getTime() > REVISION_INTERVAL_MS;
  }

  if (shouldCreateRevision) {
    await prisma.documentRevision.create({
      data: {
        documentId: document.id,
        html: snapshot.html,
        text: snapshot.text,
        trigger,
      },
    });
  }

  await prisma.documentWriteJournal.update({
    where: { id: journal.id },
    data: { status: 'accepted', resultingRevision: updated.revision },
  });

  return { status: 'written', revision: updated.revision };
}
