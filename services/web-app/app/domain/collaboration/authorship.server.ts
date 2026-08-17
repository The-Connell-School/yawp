import { prisma } from '~/utils/db.server';
import { readUpdateAttribution } from './attribution';

/**
 * Durable authorship for a collaborative draft.
 *
 * `DocumentCollabUpdate` already stamps the member who sent each update, which
 * is enough to answer "who wrote what" — right up until `compactRoom` merges the
 * log and deletes the rows it merged. The merged payload keeps every client id,
 * so the document still knows *some client* wrote the conclusion; what is gone
 * is the only record of which student that client was.
 *
 * These rows outlive compaction. One row is approximately one editing session,
 * because Yjs mints a fresh client id per document instance, so the session
 * timeline survives too — compaction also discards the per-update timestamps.
 */

export async function recordUpdateAuthorship({
  documentId,
  membershipId,
  update,
  now = new Date(),
}: {
  documentId: string;
  membershipId?: string | null;
  update: Uint8Array;
  now?: Date;
}): Promise<void> {
  const attribution = readUpdateAttribution(update);
  const { clientIds, charsInserted, charsDeleted } = attribution;

  // A pure deletion — select, Backspace — carries only a delete set. The delete
  // set names whose text went, never who removed it, so the remover's client id
  // is genuinely absent from the payload. It is recoverable from context though:
  // the same member is writing in the same session, so their most recent session
  // row for this document is the one that did it.
  if (clientIds.length === 0) {
    if (charsDeleted === 0 || !membershipId) return;
    try {
      const session = await prisma.documentCollabAuthor.findFirst({
        where: { documentId, membershipId },
        orderBy: { lastSeenAt: 'desc' },
        select: { id: true },
      });
      // No prior row means their very first act was deleting someone else's
      // text. Rare, and it costs one statistic rather than the client map.
      if (!session) return;
      await prisma.documentCollabAuthor.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          updateCount: { increment: 1 },
          charsDeleted: { increment: charsDeleted },
        },
      });
    } catch {
      // Never fail a student's write for a statistic.
    }
    return;
  }

  // Several clients in one payload means a merged update, where the per-client
  // split is not recoverable from the totals. The mapping is the irreplaceable
  // part, so record that and leave the counts at zero rather than guessing.
  const single = clientIds.length === 1;

  try {
    for (const clientId of clientIds) {
      await prisma.documentCollabAuthor.upsert({
        where: { documentId_clientId: { documentId, clientId } },
        create: {
          documentId,
          clientId,
          membershipId: membershipId ?? null,
          firstSeenAt: now,
          lastSeenAt: now,
          updateCount: 1,
          charsInserted: single ? charsInserted : 0,
          charsDeleted: single ? charsDeleted : 0,
        },
        update: {
          // firstSeenAt is deliberately absent: bumping it would erase when this
          // session began.
          lastSeenAt: now,
          updateCount: { increment: 1 },
          charsInserted: { increment: single ? charsInserted : 0 },
          charsDeleted: { increment: single ? charsDeleted : 0 },
        },
      });
    }
  } catch {
    // Runs alongside a student's edit. Losing the breakdown is bad; losing their
    // sentence is worse, so this never propagates.
  }
}

export type MemberAuthorship = {
  membershipId: string | null;
  charsInserted: number;
  charsDeleted: number;
  updateCount: number;
  /** Distinct editing sessions, one per Yjs client id. */
  sessionCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

/**
 * Everything recorded about who wrote in one document.
 *
 * `ownerOfClient` is what turns the document's own client ids into people, so a
 * caller can walk the surviving text and say who wrote each run of it.
 */
export async function readDocumentAuthorship({
  documentId,
}: {
  documentId: string;
}): Promise<{
  ownerOfClient: Map<string, string | null>;
  byMember: MemberAuthorship[];
}> {
  const rows = await prisma.documentCollabAuthor.findMany({
    where: { documentId },
    orderBy: { firstSeenAt: 'asc' },
    select: {
      clientId: true,
      membershipId: true,
      firstSeenAt: true,
      lastSeenAt: true,
      updateCount: true,
      charsInserted: true,
      charsDeleted: true,
    },
  });

  const ownerOfClient = new Map<string, string | null>();
  const totals = new Map<string, MemberAuthorship>();

  for (const row of rows) {
    ownerOfClient.set(row.clientId, row.membershipId);

    const key = row.membershipId ?? '';
    const existing = totals.get(key);
    if (!existing) {
      totals.set(key, {
        membershipId: row.membershipId,
        charsInserted: row.charsInserted,
        charsDeleted: row.charsDeleted,
        updateCount: row.updateCount,
        sessionCount: 1,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      });
      continue;
    }

    existing.charsInserted += row.charsInserted;
    existing.charsDeleted += row.charsDeleted;
    existing.updateCount += row.updateCount;
    existing.sessionCount += 1;
    if (row.firstSeenAt < existing.firstSeenAt) {
      existing.firstSeenAt = row.firstSeenAt;
    }
    if (row.lastSeenAt > existing.lastSeenAt) {
      existing.lastSeenAt = row.lastSeenAt;
    }
  }

  return { ownerOfClient, byMember: [...totals.values()] };
}
