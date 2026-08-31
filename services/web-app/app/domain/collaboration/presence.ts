import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

/**
 * Collaborator carets: the pieces both the server and the browser need.
 *
 * A caret is *presence*, not document state, and the difference decides
 * everything about how it is carried. Document updates are permanent, ordered
 * and must never be lost; a cursor position is worth nothing a second after it
 * is sent, and losing one costs a frame of animation. So presence gets its own
 * table, its own TTL and its own request — it never enters the room's update
 * log, where it would be replayed to every future reader of the draft and
 * folded into the snapshot the teacher grades.
 *
 * The wire format is y-protocols' awareness encoding, unchanged, because both
 * ends are Yjs: the browser produces it and `applyAwarenessUpdate` consumes it.
 * What lives here is the ability to look *inside* one on the way past, which
 * y-protocols does not offer and the server needs for one reason: a caret's
 * label must be the name of whoever actually posted it, not the name their
 * browser asked for.
 */

/**
 * How long a row stands without being refreshed before its writer is treated as
 * gone.
 *
 * This is the "someone closed their laptop lid" timeout. A tab that closes
 * normally says goodbye and its caret disappears at once; this covers the tab
 * that could not — crashed, killed, or offline.
 */
export const PRESENCE_TTL_MS = 15_000;

/**
 * How often an idle editor re-asserts that it is still there.
 *
 * Comfortably under a third of the TTL, so two heartbeats in a row have to be
 * lost before a writer who is sitting right there loses their caret. A caret
 * that blinks out and back reads as a bug, and this is the whole reason the TTL
 * is not tighter.
 */
export const PRESENCE_HEARTBEAT_MS = 5_000;

/**
 * The largest presence payload accepted.
 *
 * A cursor is two relative positions. Anything near this ceiling is not a
 * cursor, and this table is written several times a second per open editor —
 * so the limit is deliberately far below what the update endpoint allows.
 */
export const MAX_PRESENCE_BYTES = 4 * 1024;

/** One client's slot in an awareness update. `state: null` means it left. */
export type AwarenessEntry = {
  clientId: number;
  /**
   * The client's own counter for this state. Preserved across a rewrite: it is
   * how a peer tells a newer cursor position from one that arrived late, so
   * re-stamping it would let a stale caret overwrite a current one.
   */
  clock: number;
  state: Record<string, unknown> | null;
};

/** Who the server says is holding a caret. Never what the browser claimed. */
export type PresenceIdentity = {
  membershipId: string;
  name: string;
  color: string;
};

/**
 * Reads an awareness update.
 *
 * Mirrors `encodeAwarenessUpdate` in y-protocols: a count, then that many
 * (clientID, clock, JSON state) triples. Throws on anything else, which is the
 * behaviour the endpoint wants — bytes it cannot read are bytes it will not
 * store.
 */
export function readAwarenessUpdate(update: Uint8Array): AwarenessEntry[] {
  const decoder = decoding.createDecoder(update);
  const length = decoding.readVarUint(decoder);
  const entries: AwarenessEntry[] = [];

  for (let index = 0; index < length; index += 1) {
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state = JSON.parse(decoding.readVarString(decoder)) as
      | Record<string, unknown>
      | null;
    entries.push({ clientId, clock, state });
  }

  // A truncated update decodes into fewer entries than it declared without
  // complaining, and lib0 would simply return zeros past the end. Reject it
  // rather than storing a half-read cursor.
  if (decoding.hasContent(decoder)) {
    throw new Error('Trailing bytes in awareness update');
  }

  return entries;
}

/** Writes entries back into the same format a Yjs client will apply. */
export function writeAwarenessUpdate(entries: AwarenessEntry[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);

  for (const entry of entries) {
    encoding.writeVarUint(encoder, entry.clientId);
    encoding.writeVarUint(encoder, entry.clock);
    encoding.writeVarString(encoder, JSON.stringify(entry.state));
  }

  return encoding.toUint8Array(encoder);
}

/**
 * A relative position as `Y.relativePositionToJSON` writes it.
 *
 * Not validated field by field: y-prosemirror rebuilds it with
 * `createRelativePositionFromJSON`, which tolerates a shape it does not
 * recognise by resolving to no position, so a caret simply fails to draw. What
 * matters here is that it is an object rather than, say, a megabyte of text.
 */
function isRelativePosition(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rewrites a client's own claims about itself into what the server knows.
 *
 * Two things happen here, and both are the point of the endpoint existing.
 *
 * The name and colour are replaced. They are the one part of a caret a student
 * sees and believes, and a browser is free to put anything in them — including
 * a classmate's name. The server knows who posted, so it says so.
 *
 * Everything except the cursor is dropped. An awareness state is free-form and
 * is relayed to everyone in the group; whitelisting the two fields that draw a
 * caret means a future extension cannot quietly start broadcasting something
 * else through this channel.
 *
 * A state with no usable cursor is kept rather than discarded: it means someone
 * has the draft open but has not put their cursor in it, which is true and
 * worth knowing. A `null` state stays null — that is a tab saying goodbye.
 */
export function attributePresence(
  entries: AwarenessEntry[],
  identity: PresenceIdentity
): AwarenessEntry[] {
  return entries.map((entry) => {
    if (entry.state === null) return { ...entry, state: null };

    const cursor = entry.state.cursor as
      | { anchor?: unknown; head?: unknown }
      | undefined;
    const keepsCursor =
      isRelativePosition(cursor) &&
      isRelativePosition(cursor?.anchor) &&
      isRelativePosition(cursor?.head);

    return {
      ...entry,
      state: {
        user: identity,
        ...(keepsCursor ? { cursor } : {}),
      },
    };
  });
}

export type PresenceRow = {
  clientId: string;
  membershipId: string;
  state: Uint8Array;
  updatedAt: Date;
};

export type LivePresence = {
  clientId: number;
  membershipId: string;
  state: Uint8Array;
};

/**
 * The rows still recent enough to draw.
 *
 * Filtered on read rather than only swept on a timer, so a caret's lifetime
 * does not depend on a deletion having run. The sweep exists to keep the table
 * small; this is what keeps it honest.
 */
export function livePresence(
  rows: readonly PresenceRow[],
  now: Date
): LivePresence[] {
  const floor = now.getTime() - PRESENCE_TTL_MS;

  return rows
    .filter((row) => row.updatedAt.getTime() >= floor)
    .map((row) => ({
      clientId: Number(row.clientId),
      membershipId: row.membershipId,
      state: row.state,
    }))
    .filter((row) => Number.isFinite(row.clientId));
}
