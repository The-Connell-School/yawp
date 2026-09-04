import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as Y from 'yjs';

const prisma = {
  document: { findFirst: mock() },
  user: { findUnique: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const appendUpdate = mock();
const readUpdatesSince = mock();
const readRoomState = mock();
const compactRoomIfNeeded = mock();
const applyCollabSnapshot = mock();
const readPresence = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/collaboration/room-store.server', () => ({
  appendUpdate,
  readUpdatesSince,
  readRoomState,
  compactRoomIfNeeded,
}));
mock.module('~/domain/collaboration/dual-write.server', () => ({
  applyCollabSnapshot,
}));
mock.module('~/domain/collaboration/presence.server', () => ({ readPresence }));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}
function responseStatus(response: any) {
  return response.status ?? response.init?.status;
}

function updateWith(text: string): Uint8Array {
  const ydoc = new Y.Doc();
  ydoc.getText('t').insert(0, text);
  return Y.encodeStateAsUpdate(ydoc);
}
const b64 = (update: Uint8Array) => Buffer.from(update).toString('base64');

const ROOM = { id: 'doc-1' };

const get = (since?: string) =>
  loader({
    request: new Request(
      `https://example.com/api/collab/doc-1/updates${since ? `?since=${since}` : ''}`
    ),
    params: { id: 'doc-1' },
  } as any);

const post = (body: unknown) =>
  action({
    request: new Request('https://example.com/api/collab/doc-1/updates', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    params: { id: 'doc-1' },
  } as any);

/** Queues answers for the room gate, then the scope check. */
const queue = (...results: unknown[]) => {
  prisma.document.findFirst.mockReset();
  for (const result of results) {
    prisma.document.findFirst.mockResolvedValueOnce(result);
  }
  prisma.document.findFirst.mockResolvedValue(null);
};

describe('api.collab.$id.updates', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership
      .mockReset()
      .mockResolvedValue({ id: 'member-1', role: 'STUDENT' });
    prisma.user.findUnique.mockReset().mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockReset();
    appendUpdate.mockReset().mockResolvedValue({ seq: 42 });
    readUpdatesSince
      .mockReset()
      .mockResolvedValue({ updates: [], cursor: 0, hasMore: false });
    readRoomState.mockReset().mockResolvedValue(null);
    readPresence.mockReset().mockResolvedValue([]);
    compactRoomIfNeeded.mockReset().mockResolvedValue({ compacted: false });
    applyCollabSnapshot
      .mockReset()
      .mockResolvedValue({ status: 'written', revision: 2 });
  });

  describe('reading', () => {
    test('carries the whole live set of carets alongside the text', async () => {
      // Presence rides on this poll rather than getting one of its own: carets
      // and text are wanted on the same cadence about the same draft.
      queue(ROOM, ROOM);
      readPresence.mockResolvedValue([
        { clientId: 42, membershipId: 'member-ada', state: new Uint8Array([1, 2]) },
      ]);

      const body = await readBody(await get());

      expect(body.presence).toEqual([
        { clientId: 42, state: Buffer.from([1, 2]).toString('base64') },
      ]);
    });

    test('a teacher following the draft sees the carets in it', async () => {
      // Read scope, not author scope: they never publish one of their own, but
      // watching a group write is the point of the page for them.
      queue(ROOM, ROOM);
      readPresence.mockResolvedValue([
        { clientId: 7, membershipId: 'member-sam', state: new Uint8Array([9]) },
      ]);

      const body = await readBody(await get());

      expect(body.presence).toHaveLength(1);
    });

    test('never reads presence for a caller outside read scope', async () => {
      queue(ROOM, null);

      await get();

      expect(readPresence).not.toHaveBeenCalled();
    });

    test('returns updates after the cursor, base64 encoded', async () => {
      queue(ROOM, ROOM);
      readUpdatesSince.mockResolvedValue({
        updates: [updateWith('hello')],
        cursor: 9,
        hasMore: false,
      });

      const body = await readBody(await get('4'));

      expect(body.cursor).toBe(9);
      expect(body.updates).toHaveLength(1);
      expect(Buffer.from(body.updates[0], 'base64').length).toBeGreaterThan(0);
      expect(readUpdatesSince).toHaveBeenCalledWith({
        documentId: 'doc-1',
        sinceSeq: 4,
      });
    });

    test('a teacher with read access may follow the draft', async () => {
      // Read scope, so a teacher watching a group write is allowed here even
      // though POST will refuse them.
      queue(ROOM, ROOM);
      requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });

      expect((await readBody(await get())).success).toBe(true);
    });

    test('refuses someone with no read access', async () => {
      queue(ROOM, null);

      expect(responseStatus(await get())).toBe(403);
    });

    test('refuses a document that is not a collaboration room', async () => {
      queue(null);

      expect(responseStatus(await get())).toBe(403);
    });

    test('treats a malformed cursor as the start of the room', async () => {
      // Replaying is harmless because Yjs updates are idempotent; trusting a bad
      // number could silently skip content.
      queue(ROOM, ROOM);

      await get('not-a-number');

      expect(readUpdatesSince).toHaveBeenCalledWith({
        documentId: 'doc-1',
        sinceSeq: 0,
      });
    });

    test('treats a negative cursor as the start of the room', async () => {
      queue(ROOM, ROOM);

      await get('-5');

      expect(readUpdatesSince).toHaveBeenCalledWith({
        documentId: 'doc-1',
        sinceSeq: 0,
      });
    });
  });

  describe('writing', () => {
    test('appends the batch and returns the new cursor', async () => {
      queue(ROOM, ROOM);

      const body = await readBody(await post({ updates: [b64(updateWith('a'))] }));

      expect(body).toMatchObject({ success: true, cursor: 42 });
      expect(appendUpdate).toHaveBeenCalledWith({
        documentId: 'doc-1',
        update: expect.any(Uint8Array),
        membershipId: 'member-1',
      });
    });

    test('appends every update in the batch', async () => {
      queue(ROOM, ROOM);

      await post({ updates: [b64(updateWith('a')), b64(updateWith('b'))] });

      expect(appendUpdate).toHaveBeenCalledTimes(2);
    });

    test('refuses a teacher, who may read but not write', async () => {
      // The decision that teachers comment rather than type, enforced at the
      // transport rather than only in the UI.
      queue(ROOM, null);
      requireMembership.mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });

      const response = await post({ updates: [b64(updateWith('a'))] });

      expect(responseStatus(response)).toBe(403);
      expect(appendUpdate).not.toHaveBeenCalled();
    });

    test('dual-writes a snapshot derived from the whole room', async () => {
      // Not from the incoming batch: a snapshot of one keystroke is not a
      // document, and grading reads the snapshot.
      queue(ROOM, ROOM);
      readRoomState.mockResolvedValue(updateWith('the whole room'));

      await post({ updates: [b64(updateWith('a'))] });

      expect(readRoomState).toHaveBeenCalledWith({ documentId: 'doc-1' });
      expect(applyCollabSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-1',
          source: 'collab-http',
          membershipId: 'member-1',
        })
      );
    });

    test('skips the dual-write for an empty room', async () => {
      queue(ROOM, ROOM);
      readRoomState.mockResolvedValue(null);

      await post({ updates: [b64(updateWith('a'))] });

      expect(applyCollabSnapshot).not.toHaveBeenCalled();
    });

    test('compacts the log when it has grown', async () => {
      queue(ROOM, ROOM);

      await post({ updates: [b64(updateWith('a'))] });

      expect(compactRoomIfNeeded).toHaveBeenCalledWith({ documentId: 'doc-1' });
    });

    test('rejects a body that is not JSON', async () => {
      queue(ROOM, ROOM);

      expect(responseStatus(await post('nonsense'))).toBe(400);
      expect(appendUpdate).not.toHaveBeenCalled();
    });

    test('rejects an empty batch', async () => {
      queue(ROOM, ROOM);

      expect(responseStatus(await post({ updates: [] }))).toBe(400);
    });

    test('rejects a non-string update', async () => {
      queue(ROOM, ROOM);

      expect(responseStatus(await post({ updates: [{ not: 'a string' }] }))).toBe(
        400
      );
      expect(appendUpdate).not.toHaveBeenCalled();
    });

    test('rejects an implausibly large update', async () => {
      queue(ROOM, ROOM);
      const huge = Buffer.alloc(600 * 1024, 1).toString('base64');

      expect(responseStatus(await post({ updates: [huge] }))).toBe(413);
      expect(appendUpdate).not.toHaveBeenCalled();
    });

    test('rejects too many updates in one request', async () => {
      queue(ROOM, ROOM);
      const many = Array.from({ length: 65 }, () => b64(updateWith('x')));

      expect(responseStatus(await post({ updates: many }))).toBe(413);
      expect(appendUpdate).not.toHaveBeenCalled();
    });

    test('validates the whole batch before appending any of it', async () => {
      // The first entry is valid and the second is not. Appending as it decoded
      // would leave the room holding half a batch, so nothing is written.
      queue(ROOM, ROOM);

      const response = await post({
        updates: [b64(updateWith('a')), ''],
      });

      expect(responseStatus(response)).toBe(413);
      expect(appendUpdate).not.toHaveBeenCalled();
    });
  });
});
