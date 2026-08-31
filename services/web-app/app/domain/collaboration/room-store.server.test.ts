import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as Y from 'yjs';

const prisma = {
  documentCollabUpdate: {
    create: mock(),
    findMany: mock(),
    deleteMany: mock(),
    count: mock(),
  },
  $transaction: mock(),
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  appendUpdate,
  compactRoom,
  compactRoomIfNeeded,
  COMPACTION_THRESHOLD,
  localRoomClient,
  readRoomState,
  readUpdatesSince,
} = await import('./room-store.server');

afterAll(() => {
  mock.restore();
});

/** A real Yjs update, so merge behaviour is exercised rather than stubbed. */
function updateWith(text: string): Uint8Array {
  const ydoc = new Y.Doc();
  ydoc.getText('t').insert(0, text);
  return Y.encodeStateAsUpdate(ydoc);
}

const textOf = (update: Uint8Array) => {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, update);
  return ydoc.getText('t').toString();
};

describe('appendUpdate', () => {
  beforeEach(() => {
    prisma.documentCollabUpdate.create.mockReset().mockResolvedValue({ seq: 7 });
  });

  test('stores the update and returns its cursor', async () => {
    const update = updateWith('hello');

    await expect(
      appendUpdate({ documentId: 'doc-1', update, membershipId: 'member-1' })
    ).resolves.toEqual({ seq: 7 });

    const data = prisma.documentCollabUpdate.create.mock.calls[0][0].data;
    expect(data.documentId).toBe('doc-1');
    expect(data.membershipId).toBe('member-1');
    // Bytes must survive unchanged, or the room is corrupt.
    expect(textOf(new Uint8Array(data.update))).toBe('hello');
  });

  test('an unattributed update is stored with a null member', async () => {
    await appendUpdate({ documentId: 'doc-1', update: updateWith('x') });

    expect(
      prisma.documentCollabUpdate.create.mock.calls[0][0].data.membershipId
    ).toBeNull();
  });
});

describe('readUpdatesSince', () => {
  beforeEach(() => {
    prisma.documentCollabUpdate.findMany.mockReset();
  });

  test('asks only for rows after the cursor, in order', async () => {
    prisma.documentCollabUpdate.findMany.mockResolvedValue([]);

    await readUpdatesSince({ documentId: 'doc-1', sinceSeq: 12 });

    const args = prisma.documentCollabUpdate.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ documentId: 'doc-1', seq: { gt: 12 } });
    expect(args.orderBy).toEqual({ seq: 'asc' });
  });

  test('returns the updates and advances the cursor to the last row', async () => {
    prisma.documentCollabUpdate.findMany.mockResolvedValue([
      { seq: 13, update: Buffer.from(updateWith('a')) },
      { seq: 14, update: Buffer.from(updateWith('b')) },
    ]);

    const result = await readUpdatesSince({ documentId: 'doc-1', sinceSeq: 12 });

    expect(result.updates).toHaveLength(2);
    expect(result.cursor).toBe(14);
    expect(result.hasMore).toBe(false);
  });

  test('keeps the cursor unchanged when nothing is new', async () => {
    // Every poll with no activity must leave the client where it was, or it would
    // re-request the whole room.
    prisma.documentCollabUpdate.findMany.mockResolvedValue([]);

    const result = await readUpdatesSince({ documentId: 'doc-1', sinceSeq: 12 });

    expect(result.updates).toEqual([]);
    expect(result.cursor).toBe(12);
  });

  test('reports hasMore and does not overrun the page', async () => {
    // Fetching limit+1 is how a full page is distinguished from the last one.
    prisma.documentCollabUpdate.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        seq: i + 1,
        update: Buffer.from(updateWith(`${i}`)),
      }))
    );

    const result = await readUpdatesSince({
      documentId: 'doc-1',
      sinceSeq: 0,
      limit: 2,
    });

    expect(prisma.documentCollabUpdate.findMany.mock.calls[0][0].take).toBe(3);
    expect(result.updates).toHaveLength(2);
    expect(result.cursor).toBe(2);
    expect(result.hasMore).toBe(true);
  });
});

describe('readRoomState', () => {
  beforeEach(() => {
    prisma.documentCollabUpdate.findMany.mockReset();
  });

  test('merges the log into one update', async () => {
    const a = new Y.Doc();
    a.getText('t').insert(0, 'first ');
    const first = Y.encodeStateAsUpdate(a);
    a.getText('t').insert(6, 'second');
    const second = Y.encodeStateAsUpdate(a);

    prisma.documentCollabUpdate.findMany.mockResolvedValue([
      { update: Buffer.from(first) },
      { update: Buffer.from(second) },
    ]);

    const merged = await readRoomState({ documentId: 'doc-1' });

    expect(textOf(merged!)).toBe('first second');
  });

  test('returns null for a room with no updates', async () => {
    prisma.documentCollabUpdate.findMany.mockResolvedValue([]);

    await expect(readRoomState({ documentId: 'doc-1' })).resolves.toBeNull();
  });
});

describe('compactRoom', () => {
  beforeEach(() => {
    prisma.documentCollabUpdate.findMany.mockReset();
    prisma.documentCollabUpdate.create.mockReset().mockReturnValue('create-op');
    prisma.documentCollabUpdate.deleteMany.mockReset().mockReturnValue('delete-op');
    prisma.$transaction.mockReset().mockResolvedValue([]);
  });

  test('merges the log and deletes only what it merged', async () => {
    // Bounded by the sequence that was actually read, so an update appended
    // during compaction survives instead of being silently dropped.
    prisma.documentCollabUpdate.findMany.mockResolvedValue([
      { seq: 1, update: Buffer.from(updateWith('a')) },
      { seq: 2, update: Buffer.from(updateWith('b')) },
      { seq: 5, update: Buffer.from(updateWith('c')) },
    ]);

    const result = await compactRoom({ documentId: 'doc-1' });

    expect(result).toEqual({ compacted: true, rowsMerged: 3 });
    expect(prisma.documentCollabUpdate.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', seq: { lte: 5 } },
    });
  });

  test('writes the merged row flagged as a compaction', async () => {
    prisma.documentCollabUpdate.findMany.mockResolvedValue([
      { seq: 1, update: Buffer.from(updateWith('a')) },
      { seq: 2, update: Buffer.from(updateWith('b')) },
    ]);

    await compactRoom({ documentId: 'doc-1' });

    const data = prisma.documentCollabUpdate.create.mock.calls[0][0].data;
    expect(data.isCompaction).toBe(true);
    expect(data.documentId).toBe('doc-1');
  });

  test('deletes and inserts in one transaction', async () => {
    // Separately, a crash between them would either lose the log or duplicate it.
    prisma.documentCollabUpdate.findMany.mockResolvedValue([
      { seq: 1, update: Buffer.from(updateWith('a')) },
      { seq: 2, update: Buffer.from(updateWith('b')) },
    ]);

    await compactRoom({ documentId: 'doc-1' });

    expect(prisma.$transaction).toHaveBeenCalledWith(['create-op', 'delete-op']);
  });

  test('does nothing for a room with fewer than two rows', async () => {
    prisma.documentCollabUpdate.findMany.mockResolvedValue([
      { seq: 1, update: Buffer.from(updateWith('a')) },
    ]);

    await expect(compactRoom({ documentId: 'doc-1' })).resolves.toEqual({
      compacted: false,
      rowsMerged: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('compactRoomIfNeeded', () => {
  beforeEach(() => {
    prisma.documentCollabUpdate.count.mockReset();
    prisma.documentCollabUpdate.findMany.mockReset().mockResolvedValue([]);
    prisma.$transaction.mockReset().mockResolvedValue([]);
  });

  test('leaves a short log alone', async () => {
    prisma.documentCollabUpdate.count.mockResolvedValue(COMPACTION_THRESHOLD - 1);

    await expect(
      compactRoomIfNeeded({ documentId: 'doc-1' })
    ).resolves.toEqual({ compacted: false });
    expect(prisma.documentCollabUpdate.findMany).not.toHaveBeenCalled();
  });

  test('compacts once the log passes the threshold', async () => {
    prisma.documentCollabUpdate.count.mockResolvedValue(COMPACTION_THRESHOLD);
    prisma.documentCollabUpdate.findMany.mockResolvedValue([
      { seq: 1, update: Buffer.from(updateWith('a')) },
      { seq: 2, update: Buffer.from(updateWith('b')) },
    ]);

    await compactRoomIfNeeded({ documentId: 'doc-1' });

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('localRoomClient', () => {
  beforeEach(() => {
    prisma.documentCollabUpdate.findMany.mockReset().mockResolvedValue([]);
    prisma.documentCollabUpdate.create.mockReset().mockResolvedValue({ seq: 1 });
  });

  test('reads room state through the store', async () => {
    // This is what makes seeding testable: the same orchestration, no network.
    await expect(localRoomClient().getState('doc-1')).resolves.toBeNull();
  });

  test('seeds by appending an update', async () => {
    await localRoomClient().putState('doc-1', updateWith('seeded'));

    const data = prisma.documentCollabUpdate.create.mock.calls[0][0].data;
    expect(textOf(new Uint8Array(data.update))).toBe('seeded');
  });
});
