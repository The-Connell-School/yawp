import * as Y from 'yjs';

/**
 * Who and how much, read out of one encoded Yjs update.
 *
 * This is the whole basis of the contribution breakdown. Every item in a Yjs
 * document permanently carries the id of the client that created it, so "who
 * wrote the conclusion" is a property of the data rather than something diffed
 * out of snapshots — no `PermanentUserData` and no document-size overhead
 * required.
 *
 * The catch is that a client id is a per-session random number, not a person.
 * Only the update row knows which member sent it, so the mapping has to be
 * recorded as updates arrive; `compactRoom` later deletes those rows, and once
 * they are gone the mapping is unrecoverable.
 */
export type UpdateAttribution = {
  /** Clients that authored content in this update. */
  clientIds: string[];
  charsInserted: number;
  charsDeleted: number;
  /** Clients whose existing content this update removed. */
  deletedFromClientIds: string[];
};

const EMPTY: UpdateAttribution = {
  clientIds: [],
  charsInserted: 0,
  charsDeleted: 0,
  deletedFromClientIds: [],
};

/**
 * Client ids are stringified deliberately. Yjs generates them as uint32, which
 * runs to 4294967295 — past the 2147483647 ceiling of a Postgres `Int` column,
 * so storing them as integers would overflow on perfectly ordinary sessions.
 */
export function readUpdateAttribution(update: Uint8Array): UpdateAttribution {
  let decoded: ReturnType<typeof Y.decodeUpdate>;
  try {
    decoded = Y.decodeUpdate(update);
  } catch {
    // This runs on the write path, where a student's edit is in flight. A
    // payload we cannot read costs attribution, not their sentence.
    return EMPTY;
  }

  const clientIds = new Set<string>();
  let charsInserted = 0;

  for (const struct of decoded.structs) {
    const length = typeof struct.length === 'number' ? struct.length : 0;
    // GC and Skip structs carry a length but no content; they are placeholders
    // for content already collected, so counting them would inflate the total.
    const isContent = 'content' in struct;
    if (isContent && length > 0) {
      clientIds.add(String(struct.id.client));
      charsInserted += length;
    }
  }

  const deletedFromClientIds = new Set<string>();
  let charsDeleted = 0;
  for (const [client, ranges] of decoded.ds.clients) {
    let removed = 0;
    for (const range of ranges) removed += range.len;
    if (removed > 0) {
      deletedFromClientIds.add(String(client));
      charsDeleted += removed;
    }
  }

  return {
    clientIds: [...clientIds],
    charsInserted,
    charsDeleted,
    deletedFromClientIds: [...deletedFromClientIds],
  };
}
