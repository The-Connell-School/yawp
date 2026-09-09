import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as Y from 'yjs';

const prisma = {
  documentCollabAuthor: {
    upsert: mock(),
    findMany: mock(),
    findFirst: mock(),
    update: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { recordUpdateAuthorship, readDocumentAuthorship } = await import(
  './authorship.server'
);

afterAll(() => {
  mock.restore();
});

function captureUpdate(doc: Y.Doc, mutate: () => void): Uint8Array {
  let captured: Uint8Array | null = null;
  const handler = (update: Uint8Array) => {
    captured = update;
  };
  doc.on('update', handler);
  mutate();
  doc.off('update', handler);
  if (!captured) throw new Error('no update produced');
  return captured;
}

describe('recordUpdateAuthorship', () => {
  beforeEach(() => {
    prisma.documentCollabAuthor.upsert.mockReset().mockResolvedValue({});
    prisma.documentCollabAuthor.update.mockReset().mockResolvedValue({});
    prisma.documentCollabAuthor.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'author-row-1' });
  });

  test('records the client that wrote, keyed to the member who sent it', async () => {
    const doc = new Y.Doc();
    const update = captureUpdate(doc, () => doc.getText('t').insert(0, 'hello'));

    await recordUpdateAuthorship({
      documentId: 'doc-1',
      membershipId: 'member-1',
      update,
    });

    const call = prisma.documentCollabAuthor.upsert.mock.calls[0][0];
    expect(call.where.documentId_clientId).toEqual({
      documentId: 'doc-1',
      clientId: String(doc.clientID),
    });
    expect(call.create.membershipId).toBe('member-1');
    expect(call.create.charsInserted).toBe(5);
  });

  test('accumulates rather than overwriting on later updates', async () => {
    // The row is the running total for one editing session, so a second update
    // from the same client must add to it.
    const doc = new Y.Doc();
    const update = captureUpdate(doc, () => doc.getText('t').insert(0, 'abc'));

    await recordUpdateAuthorship({
      documentId: 'doc-1',
      membershipId: 'member-1',
      update,
    });

    const call = prisma.documentCollabAuthor.upsert.mock.calls[0][0];
    expect(call.update.charsInserted).toEqual({ increment: 3 });
    expect(call.update.updateCount).toEqual({ increment: 1 });
    expect(call.update.lastSeenAt).toBeInstanceOf(Date);
    // firstSeenAt is only set on create; bumping it would erase when they began.
    expect(call.update.firstSeenAt).toBeUndefined();
  });

  test('typing over a selection is attributed to the client that did it', () => {
    // The common revise: the update carries both the deletion and the
    // replacement text, so the client id is right there in the payload.
    const author = new Y.Doc();
    author.getText('t').insert(0, 'hello world');
    const editor = new Y.Doc();
    Y.applyUpdate(editor, Y.encodeStateAsUpdate(author));
    // One transaction, the way an editor replaces a selection — otherwise the
    // delete and the insert are two separate updates.
    const update = captureUpdate(editor, () =>
      editor.transact(() => {
        editor.getText('t').delete(0, 6);
        editor.getText('t').insert(0, 'goodbye ');
      })
    );

    return recordUpdateAuthorship({
      documentId: 'doc-1',
      membershipId: 'member-reviser',
      update,
    }).then(() => {
      const call = prisma.documentCollabAuthor.upsert.mock.calls[0][0];
      expect(call.where.documentId_clientId.clientId).toBe(
        String(editor.clientID)
      );
      expect(call.update.charsDeleted).toEqual({ increment: 6 });
    });
  });

  test('a pure deletion lands on that member’s current session', async () => {
    // Select-and-Backspace produces a delete set and nothing else. The delete
    // set names whose text went, never who removed it, so the remover's client
    // id is genuinely absent — it comes from their own most recent session.
    const author = new Y.Doc();
    author.getText('t').insert(0, 'hello world');
    const editor = new Y.Doc();
    Y.applyUpdate(editor, Y.encodeStateAsUpdate(author));
    const update = captureUpdate(editor, () => editor.getText('t').delete(0, 6));

    await recordUpdateAuthorship({
      documentId: 'doc-1',
      membershipId: 'member-reviser',
      update,
    });

    expect(prisma.documentCollabAuthor.findFirst.mock.calls[0][0].where).toEqual({
      documentId: 'doc-1',
      membershipId: 'member-reviser',
    });
    expect(prisma.documentCollabAuthor.update.mock.calls[0][0].data.charsDeleted)
      .toEqual({ increment: 6 });
    // No new client row: inventing one would put a key in the map that no item
    // in the document will ever carry.
    expect(prisma.documentCollabAuthor.upsert).not.toHaveBeenCalled();
  });

  test('a deletion before the member has written anything is dropped', async () => {
    // Costs one statistic rather than corrupting the client map.
    prisma.documentCollabAuthor.findFirst.mockResolvedValue(null);
    const author = new Y.Doc();
    author.getText('t').insert(0, 'hello world');
    const editor = new Y.Doc();
    Y.applyUpdate(editor, Y.encodeStateAsUpdate(author));
    const update = captureUpdate(editor, () => editor.getText('t').delete(0, 6));

    await recordUpdateAuthorship({
      documentId: 'doc-1',
      membershipId: 'member-reviser',
      update,
    });

    expect(prisma.documentCollabAuthor.update).not.toHaveBeenCalled();
    expect(prisma.documentCollabAuthor.upsert).not.toHaveBeenCalled();
  });

  test('a write with no member behind it is still mapped', async () => {
    // Server-side seeding has no student. The client id still has to be known,
    // or its text shows up later as authored by nobody identifiable.
    const doc = new Y.Doc();
    const update = captureUpdate(doc, () => doc.getText('t').insert(0, 'seed'));

    await recordUpdateAuthorship({
      documentId: 'doc-1',
      membershipId: null,
      update,
    });

    expect(
      prisma.documentCollabAuthor.upsert.mock.calls[0][0].create.membershipId
    ).toBeNull();
  });

  test('never lets an attribution failure fail the write', async () => {
    // This runs alongside a student's edit. Losing the breakdown is bad; losing
    // their sentence is worse.
    prisma.documentCollabAuthor.upsert.mockRejectedValue(new Error('deadlock'));
    const doc = new Y.Doc();
    const update = captureUpdate(doc, () => doc.getText('t').insert(0, 'x'));

    await expect(
      recordUpdateAuthorship({
        documentId: 'doc-1',
        membershipId: 'member-1',
        update,
      })
    ).resolves.toBeUndefined();
  });

  test('an unreadable update writes nothing', async () => {
    await recordUpdateAuthorship({
      documentId: 'doc-1',
      membershipId: 'member-1',
      update: new Uint8Array([9, 9, 9]),
    });

    expect(prisma.documentCollabAuthor.upsert).not.toHaveBeenCalled();
  });
});

describe('readDocumentAuthorship', () => {
  beforeEach(() => {
    prisma.documentCollabAuthor.findMany.mockReset().mockResolvedValue([
      {
        clientId: '111',
        membershipId: 'member-1',
        firstSeenAt: new Date('2026-08-17T09:00:00Z'),
        lastSeenAt: new Date('2026-08-17T09:20:00Z'),
        updateCount: 4,
        charsInserted: 100,
        charsDeleted: 0,
      },
      {
        clientId: '222',
        membershipId: 'member-1',
        firstSeenAt: new Date('2026-08-18T11:00:00Z'),
        lastSeenAt: new Date('2026-08-18T11:30:00Z'),
        updateCount: 2,
        charsInserted: 50,
        charsDeleted: 20,
      },
      {
        clientId: '333',
        membershipId: 'member-2',
        firstSeenAt: new Date('2026-08-17T10:00:00Z'),
        lastSeenAt: new Date('2026-08-17T10:05:00Z'),
        updateCount: 1,
        charsInserted: 10,
        charsDeleted: 0,
      },
    ]);
  });

  test('maps every client id to the member behind it', async () => {
    const { ownerOfClient } = await readDocumentAuthorship({
      documentId: 'doc-1',
    });

    expect(ownerOfClient.get('111')).toBe('member-1');
    expect(ownerOfClient.get('333')).toBe('member-2');
  });

  test('rolls a member’s separate sessions into one total', async () => {
    const { byMember } = await readDocumentAuthorship({ documentId: 'doc-1' });

    const one = byMember.find((entry) => entry.membershipId === 'member-1');
    expect(one).toMatchObject({
      charsInserted: 150,
      charsDeleted: 20,
      updateCount: 6,
      sessionCount: 2,
    });
  });

  test('spans a member’s first and last activity across sessions', async () => {
    // The free-rider signal: two sittings a day apart, not one long blur.
    const { byMember } = await readDocumentAuthorship({ documentId: 'doc-1' });

    const one = byMember.find((entry) => entry.membershipId === 'member-1');
    expect(one?.firstSeenAt.toISOString()).toBe('2026-08-17T09:00:00.000Z');
    expect(one?.lastSeenAt.toISOString()).toBe('2026-08-18T11:30:00.000Z');
  });

  test('an empty room reports nobody rather than throwing', async () => {
    prisma.documentCollabAuthor.findMany.mockResolvedValue([]);

    const result = await readDocumentAuthorship({ documentId: 'doc-1' });

    expect(result.byMember).toEqual([]);
    expect(result.ownerOfClient.size).toBe(0);
  });
});
