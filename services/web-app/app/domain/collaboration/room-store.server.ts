import * as Y from 'yjs';
import { prisma } from '~/utils/db.server';
import { type CollabRoomClient } from './seed.server';

/**
 * The collaboration room, self-hosted.
 *
 * This replaces the hosted provider. Live document state is an append-only log of
 * Yjs updates in Postgres, and clients exchange them over ordinary HTTP requests.
 *
 * That works because Yjs updates are commutative and idempotent: applying them
 * late, twice, or out of order converges on the same document. A polling transport
 * is therefore *correct*, not a compromise — the only thing it costs is latency
 * before a collaborator's text appears. Their own typing is unaffected, because
 * the editor applies local edits before the network is involved.
 */

/**
 * How many rows a room may accumulate before it is worth merging them.
 *
 * Reading a room means merging every row, so an unbounded log makes every request
 * slower. Compaction keeps that bounded without any coordination: the merged row
 * is a superset of what it replaces, so a client holding an older cursor simply
 * receives it and applies content it already has, which is a no-op.
 */
export const COMPACTION_THRESHOLD = 200;

export type RoomUpdate = { seq: number; update: Uint8Array };

/** Appends one client's update and returns the cursor it was stored at. */
export async function appendUpdate({
  documentId,
  update,
  membershipId,
}: {
  documentId: string;
  update: Uint8Array;
  membershipId?: string | null;
}): Promise<{ seq: number }> {
  const row = await prisma.documentCollabUpdate.create({
    data: {
      documentId,
      update: Buffer.from(update),
      membershipId: membershipId ?? null,
    },
    select: { seq: true },
  });

  return { seq: row.seq };
}

/**
 * Everything a client has not seen yet, plus the cursor to ask from next time.
 *
 * `sinceSeq` of 0 means "the whole room", which is what a client sends on first
 * load.
 */
export async function readUpdatesSince({
  documentId,
  sinceSeq,
  limit = 500,
}: {
  documentId: string;
  sinceSeq: number;
  limit?: number;
}): Promise<{ updates: Uint8Array[]; cursor: number; hasMore: boolean }> {
  const rows = await prisma.documentCollabUpdate.findMany({
    where: { documentId, seq: { gt: sinceSeq } },
    orderBy: { seq: 'asc' },
    take: limit + 1,
    select: { seq: true, update: true },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    updates: page.map((row) => new Uint8Array(row.update)),
    // Unchanged when there is nothing new, so the client keeps its cursor.
    cursor: page.length > 0 ? page[page.length - 1].seq : sinceSeq,
    hasMore,
  };
}

/**
 * The whole room merged into a single update, or null for an empty room.
 *
 * Used by seeding to decide whether a room is empty, and by the dual-write to
 * derive the HTML snapshot the rest of Yawp reads.
 */
export async function readRoomState({
  documentId,
}: {
  documentId: string;
}): Promise<Uint8Array | null> {
  const rows = await prisma.documentCollabUpdate.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
    select: { update: true },
  });

  if (rows.length === 0) return null;

  return mergeSurvivable(rows.map((row) => new Uint8Array(row.update)));
}

/**
 * Merges updates, skipping any that will not decode.
 *
 * The endpoint validates updates before storing them, so this should never have
 * anything to skip. It exists because the failure it guards against is
 * unrecoverable: `Y.mergeUpdates` throws on the whole batch if one member is
 * malformed, which would make a room permanently unreadable — the students in it
 * would lose their draft. Dropping one bad row loses at most that row.
 */
function mergeSurvivable(updates: Uint8Array[]): Uint8Array | null {
  const usable: Uint8Array[] = [];

  for (const update of updates) {
    const probe = new Y.Doc();
    try {
      Y.applyUpdate(probe, update);
      usable.push(update);
    } catch {
      // Skip it. Logged nowhere on purpose: this runs on a hot read path, and the
      // endpoint's validation is where a bad update should be caught.
    } finally {
      probe.destroy();
    }
  }

  if (usable.length === 0) return null;
  return Y.mergeUpdates(usable);
}

/**
 * Merges a room's log into one row.
 *
 * Deletes only rows at or below the sequence that was read, so an update appended
 * while this runs is left alone rather than silently dropped. The merged row lands
 * at a new, higher sequence, which is why a client with an older cursor still
 * receives it.
 */
export async function compactRoom({
  documentId,
}: {
  documentId: string;
}): Promise<{ compacted: boolean; rowsMerged: number }> {
  const rows = await prisma.documentCollabUpdate.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
    select: { seq: true, update: true },
  });

  if (rows.length < 2) return { compacted: false, rowsMerged: 0 };

  const upToSeq = rows[rows.length - 1].seq;
  const merged = mergeSurvivable(rows.map((row) => new Uint8Array(row.update)));
  if (!merged) return { compacted: false, rowsMerged: 0 };

  await prisma.$transaction([
    prisma.documentCollabUpdate.create({
      data: {
        documentId,
        update: Buffer.from(merged),
        isCompaction: true,
      },
    }),
    prisma.documentCollabUpdate.deleteMany({
      where: { documentId, seq: { lte: upToSeq } },
    }),
  ]);

  return { compacted: true, rowsMerged: rows.length };
}

/** Compacts only when the log has grown past the threshold. */
export async function compactRoomIfNeeded({
  documentId,
}: {
  documentId: string;
}): Promise<{ compacted: boolean }> {
  const count = await prisma.documentCollabUpdate.count({
    where: { documentId },
  });

  if (count < COMPACTION_THRESHOLD) return { compacted: false };

  const { compacted } = await compactRoom({ documentId });
  return { compacted };
}

/**
 * The seeding client, backed by this store instead of a provider's REST API.
 *
 * Seeding was the one piece of genuinely unverified HTTP in the provider design.
 * Pointing it at our own storage makes it ordinary, testable code — the same
 * `seedGroupRoomIfEmpty` orchestration, with nothing over the network.
 */
export function localRoomClient(): CollabRoomClient {
  return {
    getState: (documentName) => readRoomState({ documentId: documentName }),
    putState: async (documentName, update) => {
      await appendUpdate({ documentId: documentName, update });
    },
  };
}
