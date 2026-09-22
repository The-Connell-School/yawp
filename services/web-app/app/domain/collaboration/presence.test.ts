import { describe, expect, test } from 'bun:test';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate as yEncodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  MAX_PRESENCE_BYTES,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_TTL_MS,
  attributePresence,
  livePresence,
  readAwarenessUpdate,
  writeAwarenessUpdate,
  type AwarenessEntry,
} from './presence';

/** A real awareness update, produced the way a browser produces one. */
function browserUpdate(state: Record<string, unknown> | null) {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalState(state);
  const update = yEncodeAwarenessUpdate(awareness, [awareness.clientID]);
  const clientId = awareness.clientID;
  awareness.destroy();
  doc.destroy();
  return { update, clientId };
}

const cursor = {
  anchor: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
  head: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
};

const identity = {
  membershipId: 'member-sam',
  name: 'Sam Ortiz',
  color: '#3F6212',
};

describe('reading and writing awareness updates', () => {
  test('reads what a real Yjs client wrote', () => {
    // The wire format is y-protocols'. Nothing here invents an encoding; these
    // helpers exist so the server can look inside an update and rewrite it, not
    // so it can speak a private dialect.
    const { update, clientId } = browserUpdate({
      user: { name: 'Sam', color: '#3F6212' },
      cursor,
    });

    const entries = readAwarenessUpdate(update);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.clientId).toBe(clientId);
    expect(entries[0]!.state).toEqual({
      user: { name: 'Sam', color: '#3F6212' },
      cursor,
    });
  });

  test('what it writes, a real Yjs client can apply', () => {
    const { update, clientId } = browserUpdate({
      user: { name: 'Sam' },
      cursor,
    });
    const rewritten = writeAwarenessUpdate(
      attributePresence(readAwarenessUpdate(update), identity)
    );

    const doc = new Y.Doc();
    const peer = new Awareness(doc);
    applyAwarenessUpdate(peer, rewritten, 'test');

    expect(peer.getStates().get(clientId)).toEqual({
      user: identity,
      cursor,
    });
    peer.destroy();
    doc.destroy();
  });

  test('preserves the clock, which is how a peer orders two states', () => {
    // Re-encoding with a fresh clock would let an old cursor position overwrite
    // a newer one on arrival.
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    awareness.setLocalState({ user: {}, cursor });
    awareness.setLocalState({ user: {}, cursor });
    const update = yEncodeAwarenessUpdate(awareness, [awareness.clientID]);
    const clock = awareness.meta.get(awareness.clientID)!.clock;

    expect(readAwarenessUpdate(update)[0]!.clock).toBe(clock);
    expect(
      readAwarenessUpdate(writeAwarenessUpdate(readAwarenessUpdate(update)))[0]!
        .clock
    ).toBe(clock);

    awareness.destroy();
    doc.destroy();
  });

  test('refuses bytes that are not an awareness update', () => {
    expect(() =>
      readAwarenessUpdate(new Uint8Array([255, 255, 255]))
    ).toThrow();
  });
});

describe('attributePresence', () => {
  test('replaces whatever the browser claimed about who is writing', () => {
    // The label on a caret is the one place a client could put a classmate's
    // name on its own cursor. It never gets to: the server knows who posted.
    const entries: AwarenessEntry[] = [
      {
        clientId: 7,
        clock: 3,
        state: { user: { name: 'Ms. Rivera', color: '#000000' }, cursor },
      },
    ];

    expect(attributePresence(entries, identity)[0]!.state).toEqual({
      user: identity,
      cursor,
    });
  });

  test('drops everything except the cursor', () => {
    // An awareness state is free-form, and it is relayed to every member of the
    // group. Only the two fields that draw a caret survive the trip.
    const entries: AwarenessEntry[] = [
      {
        clientId: 7,
        clock: 1,
        state: { cursor, secretsFrom: 'the tutor conversation', user: {} },
      },
    ];

    expect(attributePresence(entries, identity)[0]!.state).toEqual({
      user: identity,
      cursor,
    });
  });

  test('keeps only a recognized tab activity state', () => {
    const entries: AwarenessEntry[] = [
      {
        clientId: 7,
        clock: 1,
        state: { cursor, activity: 'background', user: {} },
      },
      {
        clientId: 8,
        clock: 1,
        state: { activity: 'pretending-to-be-the-teacher', user: {} },
      },
    ];

    expect(attributePresence(entries, identity)[0]!.state).toEqual({
      user: identity,
      cursor,
      activity: 'background',
    });
    expect(attributePresence(entries, identity)[1]!.state).toEqual({
      user: identity,
    });
  });

  test('keeps a state with no cursor, which is someone present but idle', () => {
    const entries: AwarenessEntry[] = [
      { clientId: 7, clock: 1, state: { user: {} } },
    ];

    expect(attributePresence(entries, identity)[0]!.state).toEqual({
      user: identity,
    });
  });

  test('drops a malformed cursor rather than the whole state', () => {
    const entries: AwarenessEntry[] = [
      { clientId: 7, clock: 1, state: { cursor: { anchor: 4, head: 9 } } },
    ];

    expect(attributePresence(entries, identity)[0]!.state).toEqual({
      user: identity,
    });
  });

  test('leaves a null state null, which is how a closing tab says goodbye', () => {
    const entries: AwarenessEntry[] = [{ clientId: 7, clock: 9, state: null }];

    expect(attributePresence(entries, identity)[0]!.state).toBeNull();
  });
});

describe('livePresence', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);

  test('keeps rows still inside the TTL', () => {
    const rows = [
      {
        clientId: '1',
        membershipId: 'a',
        state: new Uint8Array([1]),
        updatedAt: at(0),
      },
      {
        clientId: '2',
        membershipId: 'b',
        state: new Uint8Array([2]),
        updatedAt: at(PRESENCE_TTL_MS - 1),
      },
    ];

    expect(livePresence(rows, now).map((row) => row.clientId)).toEqual([1, 2]);
  });

  test('drops a tab that stopped saying it was there', () => {
    // The TTL is what covers a browser that was closed, crashed or lost its
    // network before it could send a goodbye. Without it the caret of someone
    // who left at lunch is still in the margin at the end of the period.
    const rows = [
      {
        clientId: '1',
        membershipId: 'a',
        state: new Uint8Array([1]),
        updatedAt: at(PRESENCE_TTL_MS + 1),
      },
    ];

    expect(livePresence(rows, now)).toEqual([]);
  });

  test('the TTL leaves room for a heartbeat to be late', () => {
    // A caret that blinks out between heartbeats reads as a bug. Two missed
    // beats, not one, before a writer is called gone.
    expect(PRESENCE_TTL_MS).toBeGreaterThanOrEqual(PRESENCE_HEARTBEAT_MS * 2);
  });
});

describe('MAX_PRESENCE_BYTES', () => {
  test('is small enough that presence cannot be used as storage', () => {
    // A cursor is two relative positions. Anything approaching a document is
    // not a cursor, and this table is written to several times a second.
    expect(MAX_PRESENCE_BYTES).toBeLessThanOrEqual(8 * 1024);
  });
});
