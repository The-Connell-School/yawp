import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  base64ToBytes,
  bytesToBase64,
  CollabHttpProvider,
  REMOTE_ORIGIN,
  type FetchLike,
} from './http-provider';
import { readAwarenessUpdate, writeAwarenessUpdate } from './presence';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A stand-in server backed by a real update log, so the two clients in these
 * tests genuinely converge through Yjs rather than through a stub.
 */
function fakeServer() {
  const log: { seq: number; update: Uint8Array }[] = [];
  let nextSeq = 1;
  const calls = { get: 0, post: 0, presence: 0 };
  let failNext: 'get' | 'post' | null = null;
  /** One row per client, exactly as the presence table holds them. */
  const presence = new Map<number, Uint8Array>();
  /** How many times each client published, so an echo is visible as a count. */
  const presenceCalls = new Map<number, number>();

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url.toString();

    if (href.includes('/presence')) {
      calls.presence += 1;
      const body = JSON.parse(String(init?.body)) as { awareness: string };
      for (const entry of readAwarenessUpdate(base64ToBytes(body.awareness))) {
        presenceCalls.set(
          entry.clientId,
          (presenceCalls.get(entry.clientId) ?? 0) + 1
        );
        if (entry.state === null) presence.delete(entry.clientId);
        else presence.set(entry.clientId, writeAwarenessUpdate([entry]));
      }
      return Response.json({ success: true });
    }

    if (init?.method === 'POST') {
      calls.post += 1;
      if (failNext === 'post') {
        failNext = null;
        return new Response('nope', { status: 500 });
      }
      const body = JSON.parse(String(init.body)) as { updates: string[] };
      for (const encoded of body.updates) {
        log.push({ seq: nextSeq, update: base64ToBytes(encoded) });
        nextSeq += 1;
      }
      return Response.json({ success: true, cursor: nextSeq - 1 });
    }

    calls.get += 1;
    if (failNext === 'get') {
      failNext = null;
      return new Response('nope', { status: 500 });
    }
    const since = Number(new URL(href, 'https://x.test').searchParams.get('since') ?? 0);
    const rows = log.filter((row) => row.seq > since);
    return Response.json({
      success: true,
      cursor: rows.length > 0 ? rows[rows.length - 1].seq : since,
      updates: rows.map((row) => bytesToBase64(row.update)),
      presence: [...presence.entries()].map(([clientId, state]) => ({
        clientId,
        state: bytesToBase64(state),
      })),
    });
  }) as FetchLike;

  return {
    fetchImpl,
    log,
    calls,
    presence,
    presenceCalls,
    failOnce: (which: 'get' | 'post') => {
      failNext = which;
    },
  };
}

const cursorAt = (offset: number) => ({
  anchor: { type: null, tname: 'prosemirror', item: null, assoc: offset },
  head: { type: null, tname: 'prosemirror', item: null, assoc: offset },
});

const textOf = (ydoc: Y.Doc) => ydoc.getText('t').toString();

describe('base64 round trip', () => {
  test('survives arbitrary bytes, including zero and 255', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes)
    );
  });

  test('survives a real Yjs update', () => {
    const ydoc = new Y.Doc();
    ydoc.getText('t').insert(0, 'round trip');
    const update = Y.encodeStateAsUpdate(ydoc);

    const restored = new Y.Doc();
    Y.applyUpdate(restored, base64ToBytes(bytesToBase64(update)));

    expect(textOf(restored)).toBe('round trip');
  });
});

describe('CollabHttpProvider', () => {
  test('the default fetch is callable as a method', async () => {
    // Regression: assigning the global fetch to an instance field and calling it
    // as this.fetchImpl(...) throws "Illegal invocation" in a browser, so no
    // request ever left the page. Every other test injects a fetch, so none of
    // them touched the default.
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      calls.push(String(url));
      return Response.json({ success: true, cursor: 0, updates: [] });
    }) as unknown as typeof fetch;

    try {
      const provider = new CollabHttpProvider({
        documentId: 'doc-1',
        ydoc: new Y.Doc(),
        canWrite: true,
        pollIntervalMs: 10_000,
      });
      await provider.start();
      provider.destroy();
    } finally {
      globalThis.fetch = original;
    }

    // Both channels go through the same default fetch, so both would have hit
    // the same illegal-invocation bug. Two presence calls: arriving, then the
    // goodbye the closing tab sends so its caret does not linger.
    expect(calls.filter((url) => url.includes('/updates'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/presence'))).toHaveLength(2);
  });

  test('sends local edits and stores them on the server', async () => {
    const server = fakeServer();
    const ydoc = new Y.Doc();
    const provider = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc,
      canWrite: true,
      sendDebounceMs: 5,
      pollIntervalMs: 10_000,
      fetchImpl: server.fetchImpl,
    });

    await provider.start();
    ydoc.getText('t').insert(0, 'typed');
    await tick(40);

    expect(server.log.length).toBeGreaterThan(0);
    provider.destroy();
  });

  test('two clients converge on the same text', async () => {
    // The actual point of the whole transport.
    const server = fakeServer();

    const docA = new Y.Doc();
    const a = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: docA,
      canWrite: true,
      sendDebounceMs: 5,
      pollIntervalMs: 15,
      fetchImpl: server.fetchImpl,
    });
    const docB = new Y.Doc();
    const b = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: docB,
      canWrite: true,
      sendDebounceMs: 5,
      pollIntervalMs: 15,
      fetchImpl: server.fetchImpl,
    });

    await a.start();
    await b.start();

    docA.getText('t').insert(0, 'Maya wrote. ');
    await tick(120);
    docB.getText('t').insert(textOf(docB).length, 'Devon wrote.');
    await tick(120);

    expect(textOf(docA)).toBe(textOf(docB));
    expect(textOf(docA)).toContain('Maya wrote.');
    expect(textOf(docA)).toContain('Devon wrote.');

    a.destroy();
    b.destroy();
  });

  test('does not echo a remote update back to the server', async () => {
    // Without the origin tag two clients would trade the same bytes forever.
    const server = fakeServer();

    const docA = new Y.Doc();
    docA.getText('t').insert(0, 'from A');
    const seed = Y.encodeStateAsUpdate(docA);

    const docB = new Y.Doc();
    const b = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: docB,
      canWrite: true,
      sendDebounceMs: 5,
      pollIntervalMs: 10_000,
      fetchImpl: server.fetchImpl,
    });
    await b.start();

    const postsBefore = server.calls.post;
    Y.applyUpdate(docB, seed, REMOTE_ORIGIN);
    await tick(40);

    expect(server.calls.post).toBe(postsBefore);
    b.destroy();
  });

  test('a read-only client never posts', async () => {
    // Teachers follow the draft; they do not write in it.
    const server = fakeServer();
    const ydoc = new Y.Doc();
    const provider = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc,
      canWrite: false,
      sendDebounceMs: 5,
      pollIntervalMs: 10_000,
      fetchImpl: server.fetchImpl,
    });

    await provider.start();
    ydoc.getText('t').insert(0, 'should not be sent');
    await tick(40);

    expect(server.calls.post).toBe(0);
    provider.destroy();
  });

  test('keeps edits queued when a send fails, and sends them later', async () => {
    // A blip must cost latency, not a sentence.
    const server = fakeServer();
    const ydoc = new Y.Doc();
    const provider = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc,
      canWrite: true,
      sendDebounceMs: 5,
      pollIntervalMs: 10_000,
      fetchImpl: server.fetchImpl,
    });
    await provider.start();

    server.failOnce('post');
    ydoc.getText('t').insert(0, 'survives a failure');
    await tick(40);
    expect(server.log).toHaveLength(0);

    // A later edit flushes the retained batch alongside the new one.
    ydoc.getText('t').insert(0, '!');
    await tick(60);

    const restored = new Y.Doc();
    for (const row of server.log) Y.applyUpdate(restored, row.update);
    expect(textOf(restored)).toContain('survives a failure');

    provider.destroy();
  });

  test('reports an error when the initial load fails', async () => {
    const server = fakeServer();
    server.failOnce('get');
    const statuses: string[] = [];

    const provider = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: new Y.Doc(),
      canWrite: true,
      fetchImpl: server.fetchImpl,
      onStatusChange: (status) => statuses.push(status.kind),
    });

    await provider.start();

    expect(statuses).toEqual(['connecting', 'error']);
    provider.destroy();
  });

  test('reports live once the room has loaded', async () => {
    const server = fakeServer();
    const statuses: string[] = [];

    const provider = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: new Y.Doc(),
      canWrite: true,
      pollIntervalMs: 10_000,
      fetchImpl: server.fetchImpl,
      onStatusChange: (status) => statuses.push(status.kind),
    });

    await provider.start();

    expect(statuses).toEqual(['connecting', 'live']);
    provider.destroy();
  });

  test('a late joiner receives the whole room', async () => {
    const server = fakeServer();

    const docA = new Y.Doc();
    const a = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: docA,
      canWrite: true,
      sendDebounceMs: 5,
      pollIntervalMs: 10_000,
      fetchImpl: server.fetchImpl,
    });
    await a.start();
    docA.getText('t').insert(0, 'written before they arrived');
    await tick(40);

    const docLate = new Y.Doc();
    const late = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: docLate,
      canWrite: true,
      pollIntervalMs: 10_000,
      fetchImpl: server.fetchImpl,
    });
    await late.start();

    expect(textOf(docLate)).toBe('written before they arrived');

    a.destroy();
    late.destroy();
  });

  test('stops polling after destroy', async () => {
    const server = fakeServer();
    const provider = new CollabHttpProvider({
      documentId: 'doc-1',
      ydoc: new Y.Doc(),
      canWrite: true,
      pollIntervalMs: 10,
      fetchImpl: server.fetchImpl,
    });

    await provider.start();
    provider.destroy();
    const after = server.calls.get;
    await tick(60);

    expect(server.calls.get).toBe(after);
  });
});

describe('carets', () => {
  /** Two providers on one fake server, wired the way the editor wires them. */
  function pair(server: ReturnType<typeof fakeServer>) {
    const make = (canWrite = true, presenceHeartbeatMs = 30) => {
      const ydoc = new Y.Doc();
      const provider = new CollabHttpProvider({
        documentId: 'doc-1',
        ydoc,
        canWrite,
        fetchImpl: server.fetchImpl,
        sendDebounceMs: 1,
        pollIntervalMs: 5,
        presenceDebounceMs: 1,
        presenceHeartbeatMs,
      });
      return { ydoc, provider };
    };
    return { make };
  }

  test("a teammate's caret reaches the other browser", async () => {
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make();
    const ada = make();
    await Promise.all([sam.provider.start(), ada.provider.start()]);

    sam.provider.awareness.setLocalState({
      user: { name: 'Sam', color: '#3F6212' },
      cursor: cursorAt(4),
    });
    await tick(40);

    expect(
      ada.provider.awareness.getStates().get(sam.provider.awareness.clientID)
    ).toEqual({ user: { name: 'Sam', color: '#3F6212' }, cursor: cursorAt(4) });

    sam.provider.destroy();
    ada.provider.destroy();
  });

  test('a caret never enters the document log', async () => {
    // The whole reason presence has its own endpoint. A cursor in the update
    // log would be replayed to everyone who ever opens the draft and folded
    // into the snapshot the teacher grades.
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make();
    await sam.provider.start();

    sam.provider.awareness.setLocalState({ user: {}, cursor: cursorAt(1) });
    await tick(20);

    expect(server.calls.presence).toBeGreaterThan(0);
    expect(server.log).toHaveLength(0);
    sam.provider.destroy();
  });

  test('a caret that stops being reported disappears', async () => {
    // Covers the tab that was closed, crashed or lost its network without
    // getting to say goodbye: the server stops listing it, and the peer clears
    // it rather than leaving a caret in the margin for the rest of the period.
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make();
    const ada = make();
    await Promise.all([sam.provider.start(), ada.provider.start()]);

    sam.provider.awareness.setLocalState({ user: {}, cursor: cursorAt(2) });
    await tick(40);
    expect(
      ada.provider.awareness.getStates().has(sam.provider.awareness.clientID)
    ).toBe(true);

    server.presence.clear();
    await tick(40);

    expect(
      ada.provider.awareness.getStates().has(sam.provider.awareness.clientID)
    ).toBe(false);
    sam.provider.destroy();
    ada.provider.destroy();
  });

  test('closing a tab clears its caret without waiting for the timeout', async () => {
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make();
    await sam.provider.start();
    sam.provider.awareness.setLocalState({ user: {}, cursor: cursorAt(3) });
    await tick(20);
    expect(server.presence.size).toBe(1);

    sam.provider.destroy();
    await tick(20);

    expect(server.presence.size).toBe(0);
  });

  test('a reader publishes nothing, but still sees the writers', async () => {
    // The teacher's side of the page: they follow a group writing without
    // standing in the draft, and the endpoint would refuse them anyway.
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make();
    const teacher = make(false);
    await Promise.all([sam.provider.start(), teacher.provider.start()]);

    sam.provider.awareness.setLocalState({ user: {}, cursor: cursorAt(5) });
    teacher.provider.awareness.setLocalState({ user: {}, cursor: cursorAt(9) });
    await tick(40);

    expect(server.presence.has(teacher.provider.awareness.clientID)).toBe(false);
    expect(
      teacher.provider.awareness
        .getStates()
        .has(sam.provider.awareness.clientID)
    ).toBe(true);

    sam.provider.destroy();
    teacher.provider.destroy();
  });

  test('keeps saying it is there while nobody types', async () => {
    // A writer who is reading rather than typing still has a caret. Without a
    // heartbeat the TTL would take it away from them mid-sentence.
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make();
    await sam.provider.start();
    sam.provider.awareness.setLocalState({ user: {}, cursor: cursorAt(1) });
    await tick(20);
    const beats = server.calls.presence;

    await tick(80);

    expect(server.calls.presence).toBeGreaterThan(beats);
    sam.provider.destroy();
  });

  test("does not send a teammate's caret back to the server", async () => {
    // Applying a remote awareness state fires the same event a local move does.
    // Echoing it would have two browsers trading one caret forever, each arrival
    // provoking the next send. Heartbeats are off here so any growth in Ada's
    // count is an echo rather than a beat.
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make(true, 10_000);
    const ada = make(true, 10_000);
    await Promise.all([sam.provider.start(), ada.provider.start()]);
    await tick(20);

    // Ada has announced herself once — she is in the room — and nothing since.
    const adaId = ada.provider.awareness.clientID;
    const before = server.presenceCalls.get(adaId) ?? 0;

    sam.provider.awareness.setLocalState({ user: {}, cursor: cursorAt(6) });
    await tick(40);

    expect(
      ada.provider.awareness.getStates().has(sam.provider.awareness.clientID)
    ).toBe(true);
    expect(server.presenceCalls.get(adaId) ?? 0).toBe(before);

    sam.provider.destroy();
    ada.provider.destroy();
  });

  test('announces a writer who has the draft open but no cursor in it', async () => {
    // Presence is "who is here", and a caret is only the part of it that can be
    // drawn. Someone reading their group's draft without clicking into it is
    // still in the room, and y-prosemirror simply draws nothing for a state
    // with no cursor.
    const server = fakeServer();
    const { make } = pair(server);
    const sam = make();
    await sam.provider.start();
    await tick(20);

    expect(server.presence.has(sam.provider.awareness.clientID)).toBe(true);
    sam.provider.destroy();
  });
});
