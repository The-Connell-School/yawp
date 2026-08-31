import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: { findFirst: mock() },
  user: { findUnique: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const presenceIdentityFor = mock();
const publishPresence = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/collaboration/presence.server', () => ({
  presenceIdentityFor,
  publishPresence,
}));

const { action } = await import('./route');
const { writeAwarenessUpdate, MAX_PRESENCE_BYTES } = await import(
  '~/domain/collaboration/presence'
);

afterAll(() => {
  mock.restore();
});

function responseStatus(response: any) {
  return response.status ?? response.init?.status;
}
async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

const ROOM = { id: 'doc-1' };

/** Queues answers for the room gate, then the scope check. */
const queue = (...results: unknown[]) => {
  prisma.document.findFirst.mockReset();
  for (const result of results) {
    prisma.document.findFirst.mockResolvedValueOnce(result);
  }
  prisma.document.findFirst.mockResolvedValue(null);
};

const post = (body: unknown, params: { id?: string } = { id: 'doc-1' }) =>
  action({
    request: new Request(
      `https://example.com/api/collab/${params.id ?? ''}/presence`,
      {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }
    ),
    params,
  } as any);

const cursor = {
  anchor: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
  head: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
};

const awareness = () =>
  Buffer.from(
    writeAwarenessUpdate([
      { clientId: 42, clock: 1, state: { user: {}, cursor } },
    ])
  ).toString('base64');

describe('api.collab.$id.presence', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({ id: 'member-sam' });
    prisma.user.findUnique.mockReset().mockResolvedValue({ isAdmin: false });
    presenceIdentityFor.mockReset().mockResolvedValue({
      membershipId: 'member-sam',
      name: 'Sam Ortiz',
      color: '#3F6212',
    });
    publishPresence.mockReset().mockResolvedValue({ status: 'stored' });
    queue(ROOM, ROOM);
  });

  test('publishes a caret for a member of the group', async () => {
    const response = await post({ awareness: awareness() });

    expect(await readBody(response)).toEqual({ success: true });
    expect(publishPresence.mock.calls[0][0]).toMatchObject({
      documentId: 'doc-1',
      membershipId: 'member-sam',
    });
  });

  test('attributes the caret to the session, never to the payload', async () => {
    // The endpoint takes bytes and a cookie. Who the caret belongs to comes
    // from the cookie; nothing in the body is consulted about identity.
    await post({ awareness: awareness(), membershipId: 'member-ada' });

    expect(presenceIdentityFor).toHaveBeenCalledWith({
      documentId: 'doc-1',
      membershipId: 'member-sam',
    });
    expect(publishPresence.mock.calls[0][0].identity.membershipId).toBe(
      'member-sam'
    );
  });

  test('refuses a teacher, who follows the draft but does not stand in it', async () => {
    // Read scope passes for them on the update GET; author scope does not pass
    // here, which is the same line that stops them typing in the draft.
    queue(ROOM, null);

    const response = await post({ awareness: awareness() });

    expect(responseStatus(response)).toBe(403);
    expect(publishPresence).not.toHaveBeenCalled();
  });

  test('refuses a document that is not a collaborative room', async () => {
    queue(null);

    expect(responseStatus(await post({ awareness: awareness() }))).toBe(403);
    expect(publishPresence).not.toHaveBeenCalled();
  });

  test('refuses a request with no document', async () => {
    expect(responseStatus(await post({ awareness: awareness() }, {}))).toBe(400);
  });

  test('refuses a member who is no longer in the group', async () => {
    // Removed from the group between opening the page and moving the cursor.
    // Author scope may still pass on a stale membership row, so the identity
    // lookup is the second lock rather than a convenience.
    presenceIdentityFor.mockResolvedValue(null);

    expect(responseStatus(await post({ awareness: awareness() }))).toBe(403);
    expect(publishPresence).not.toHaveBeenCalled();
  });

  test('refuses a body that is not JSON', async () => {
    expect(responseStatus(await post('not json'))).toBe(400);
  });

  test('refuses a body with no awareness', async () => {
    expect(responseStatus(await post({}))).toBe(400);
  });

  test('refuses a payload too large to be a cursor', async () => {
    // Presence is written several times a second per open editor. A cursor is
    // two positions; anything near this ceiling is someone using the caret
    // channel as storage.
    const oversized = Buffer.alloc(MAX_PRESENCE_BYTES + 1, 1).toString('base64');

    expect(responseStatus(await post({ awareness: oversized }))).toBe(413);
    expect(publishPresence).not.toHaveBeenCalled();
  });

  test('reports unreadable bytes as a bad request', async () => {
    publishPresence.mockResolvedValue({
      status: 'rejected',
      reason: 'unreadable',
    });

    expect(responseStatus(await post({ awareness: awareness() }))).toBe(400);
  });

  test('reports a crowd of claimed clients as too large', async () => {
    publishPresence.mockResolvedValue({
      status: 'rejected',
      reason: 'too-many-clients',
    });

    expect(responseStatus(await post({ awareness: awareness() }))).toBe(413);
  });
});
