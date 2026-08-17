import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  base64ToBytes,
  bytesToBase64,
  CollabHttpProvider,
  REMOTE_ORIGIN,
  type FetchLike,
} from './http-provider';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A stand-in server backed by a real update log, so the two clients in these
 * tests genuinely converge through Yjs rather than through a stub.
 */
function fakeServer() {
  const log: { seq: number; update: Uint8Array }[] = [];
  let nextSeq = 1;
  const calls = { get: 0, post: 0 };
  let failNext: 'get' | 'post' | null = null;

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url.toString();

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
    });
  }) as FetchLike;

  return {
    fetchImpl,
    log,
    calls,
    failOnce: (which: 'get' | 'post') => {
      failNext = which;
    },
  };
}

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

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/api/collab/doc-1/updates');
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
