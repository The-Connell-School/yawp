import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentGroup: { findFirst: mock() },
  documentCollabPresence: {
    upsert: mock(),
    deleteMany: mock(),
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { presenceIdentityFor, publishPresence, readPresence } = await import(
  './presence.server'
);
const { readAwarenessUpdate, writeAwarenessUpdate, PRESENCE_TTL_MS } =
  await import('./presence');
const { buildAuthorColorScale } = await import('./author-colors');

afterAll(() => {
  mock.restore();
});

const cursor = {
  anchor: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
  head: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
};

const identity = {
  membershipId: 'member-sam',
  name: 'Sam Ortiz',
  color: '#3F6212',
};

const member = (membershipId: string, name: string | null) => ({
  membershipId,
  membership: { user: { name } },
});

describe('presenceIdentityFor', () => {
  beforeEach(() => {
    prisma.documentGroup.findFirst.mockReset();
  });

  test('gives a member the colour their initials already have', async () => {
    // The same scale, from the same ordered member list, that the roster
    // avatars and the teacher's contribution panel build. A caret in a
    // different colour from its owner's avatar is worse than no caret.
    const members = [
      member('member-ada', 'Ada Chen'),
      member('member-sam', 'Sam Ortiz'),
    ];
    prisma.documentGroup.findFirst.mockResolvedValue({ members });

    const resolved = await presenceIdentityFor({
      documentId: 'doc-1',
      membershipId: 'member-sam',
    });

    expect(resolved).toEqual({
      membershipId: 'member-sam',
      name: 'Sam Ortiz',
      color: buildAuthorColorScale(['member-ada', 'member-sam']).get(
        'member-sam'
      )!,
    });
  });

  test('asks for members in a fixed order', async () => {
    // The scale is a function of the member list, so an unordered query would
    // let the same student be olive on one page load and fuchsia on the next.
    prisma.documentGroup.findFirst.mockResolvedValue({ members: [] });

    await presenceIdentityFor({
      documentId: 'doc-1',
      membershipId: 'member-sam',
    });

    expect(
      prisma.documentGroup.findFirst.mock.calls[0][0].select.members.orderBy
    ).toEqual({ membershipId: 'asc' });
  });

  test('gives a teacher reading the draft no identity, so no caret', async () => {
    prisma.documentGroup.findFirst.mockResolvedValue({
      members: [member('member-ada', 'Ada Chen')],
    });

    expect(
      await presenceIdentityFor({
        documentId: 'doc-1',
        membershipId: 'member-teacher',
      })
    ).toBeNull();
  });

  test('labels an unnamed member rather than an empty caret', async () => {
    prisma.documentGroup.findFirst.mockResolvedValue({
      members: [member('member-sam', '   ')],
    });

    const resolved = await presenceIdentityFor({
      documentId: 'doc-1',
      membershipId: 'member-sam',
    });

    expect(resolved?.name).toBe('Student');
  });
});

describe('publishPresence', () => {
  beforeEach(() => {
    prisma.documentCollabPresence.upsert.mockReset().mockResolvedValue({});
    prisma.documentCollabPresence.deleteMany.mockReset().mockResolvedValue({});
  });

  const publish = (entries: Parameters<typeof writeAwarenessUpdate>[0]) =>
    publishPresence({
      documentId: 'doc-1',
      membershipId: 'member-sam',
      identity,
      update: writeAwarenessUpdate(entries),
    });

  test('stores a caret under the poster, labelled by the server', async () => {
    const result = await publish([
      { clientId: 42, clock: 5, state: { user: { name: 'Ada Chen' }, cursor } },
    ]);

    expect(result).toEqual({ status: 'stored' });

    const call = prisma.documentCollabPresence.upsert.mock.calls[0][0];
    expect(call.where.documentId_membershipId_clientId).toEqual({
      documentId: 'doc-1',
      membershipId: 'member-sam',
      clientId: '42',
    });
    // The name the browser sent is gone; what is stored is who actually posted.
    expect(readAwarenessUpdate(new Uint8Array(call.create.state))).toEqual([
      { clientId: 42, clock: 5, state: { user: identity, cursor } },
    ]);
  });

  test('a goodbye deletes the row instead of storing an absence', async () => {
    await publish([{ clientId: 42, clock: 9, state: null }]);

    expect(prisma.documentCollabPresence.upsert).not.toHaveBeenCalled();
    expect(
      prisma.documentCollabPresence.deleteMany.mock.calls[0][0].where
    ).toEqual({ documentId: 'doc-1', membershipId: 'member-sam', clientId: '42' });
  });

  test('a goodbye for an already-swept row does not throw on the way out', async () => {
    // deleteMany, not delete: the last thing a closing tab does must not be an
    // error because a sweep beat it to the row.
    await expect(
      publish([{ clientId: 42, clock: 9, state: null }])
    ).resolves.toEqual({ status: 'stored' });
  });

  test('refuses bytes it cannot read', async () => {
    expect(
      await publishPresence({
        documentId: 'doc-1',
        membershipId: 'member-sam',
        identity,
        update: new Uint8Array([9, 9, 9, 9]),
      })
    ).toEqual({ status: 'rejected', reason: 'unreadable' });
    expect(prisma.documentCollabPresence.upsert).not.toHaveBeenCalled();
  });

  test('refuses a request claiming a crowd of clients', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      clientId: index + 1,
      clock: 1,
      state: { cursor },
    }));

    expect(await publish(many)).toEqual({
      status: 'rejected',
      reason: 'too-many-clients',
    });
    expect(prisma.documentCollabPresence.upsert).not.toHaveBeenCalled();
  });

  test('writes one row per client, never one row holding several', async () => {
    // Each row is keyed by client id, so a student with two tabs keeps two
    // carets and closing one does not take the other with it.
    await publish([
      { clientId: 1, clock: 1, state: { cursor } },
      { clientId: 2, clock: 1, state: { cursor } },
    ]);

    expect(prisma.documentCollabPresence.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('readPresence', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const row = (clientId: string, msAgo: number) => ({
    clientId,
    membershipId: `member-${clientId}`,
    state: Buffer.from(
      writeAwarenessUpdate([
        { clientId: Number(clientId), clock: 1, state: { user: identity, cursor } },
      ])
    ),
    updatedAt: new Date(now.getTime() - msAgo),
  });

  beforeEach(() => {
    prisma.documentCollabPresence.findMany.mockReset();
    prisma.documentCollabPresence.deleteMany.mockReset().mockResolvedValue({});
  });

  test('returns the writers still saying they are there', async () => {
    prisma.documentCollabPresence.findMany.mockResolvedValue([
      row('1', 0),
      row('2', PRESENCE_TTL_MS + 1),
    ]);

    const live = await readPresence({ documentId: 'doc-1', now });

    expect(live.map((entry) => entry.clientId)).toEqual([1]);
  });

  test('sweeps only when it saw something stale', async () => {
    // The common poll is everyone present and nothing to delete. Paying for a
    // write on every one of those would turn a read path into a write path.
    prisma.documentCollabPresence.findMany.mockResolvedValue([row('1', 0)]);

    await readPresence({ documentId: 'doc-1', now });

    expect(prisma.documentCollabPresence.deleteMany).not.toHaveBeenCalled();
  });

  test('sweeps the stale rows it did see', async () => {
    prisma.documentCollabPresence.findMany.mockResolvedValue([
      row('1', PRESENCE_TTL_MS + 1),
    ]);

    await readPresence({ documentId: 'doc-1', now });

    expect(
      prisma.documentCollabPresence.deleteMany.mock.calls[0][0].where
    ).toEqual({
      documentId: 'doc-1',
      updatedAt: { lt: new Date(now.getTime() - PRESENCE_TTL_MS) },
    });
  });
});
