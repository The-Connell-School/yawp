import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentGroup: { findUnique: mock(), update: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { seedGroupRoomIfEmpty, SeedError } = await import('./seed.server');
const { htmlToYUpdate } = await import('./seed');
const { yUpdateToSnapshot } = await import('./snapshot');

afterAll(() => {
  mock.restore();
});

const HTML = '<p>Work the student already did.</p>';

const group = (overrides: Record<string, unknown> = {}) => ({
  id: 'group-1',
  seededAt: null,
  documentId: 'doc-1',
  document: { html: HTML },
  ...overrides,
});

/** A fake room, so the orchestration is tested without a network. */
function fakeClient({ state = null as Uint8Array | null, failPut = false } = {}) {
  const puts: { name: string; update: Uint8Array }[] = [];
  return {
    puts,
    client: {
      getState: async () => state,
      putState: async (name: string, update: Uint8Array) => {
        if (failPut) throw new Error('provider rejected the write');
        puts.push({ name, update });
      },
    },
  };
}

describe('seedGroupRoomIfEmpty', () => {
  beforeEach(() => {
    prisma.documentGroup.findUnique.mockReset().mockResolvedValue(group());
    prisma.documentGroup.update.mockReset().mockResolvedValue({});
  });

  test('seeds an empty room with the document’s content', async () => {
    const { client, puts } = fakeClient({ state: null });

    const result = await seedGroupRoomIfEmpty({ groupId: 'group-1', client });

    expect(result).toEqual({ status: 'seeded' });
    expect(puts).toHaveLength(1);
    expect(puts[0].name).toBe('doc-1');
    // What landed in the room is the document, read back through the same
    // converter the dual-write uses.
    expect(yUpdateToSnapshot(puts[0].update).text).toBe(
      'Work the student already did.'
    );
  });

  test('stamps seededAt only after the provider accepts the write', async () => {
    const { client } = fakeClient({ state: null });

    await seedGroupRoomIfEmpty({ groupId: 'group-1', client });

    expect(prisma.documentGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { seededAt: expect.any(Date) },
    });
  });

  test('does not stamp seededAt when the provider write fails', async () => {
    // The ordering that matters: stamping first would turn one dropped response
    // into a group whose draft silently starts empty, with no way to retry.
    const { client } = fakeClient({ state: null, failPut: true });

    await expect(
      seedGroupRoomIfEmpty({ groupId: 'group-1', client })
    ).rejects.toThrow(/provider rejected/);

    expect(prisma.documentGroup.update).not.toHaveBeenCalled();
  });

  test('refuses to seed a group already marked seeded, without asking the room', async () => {
    prisma.documentGroup.findUnique.mockResolvedValue(
      group({ seededAt: new Date('2026-08-17') })
    );
    let asked = false;
    const client = {
      getState: async () => {
        asked = true;
        return null;
      },
      putState: async () => {},
    };

    const result = await seedGroupRoomIfEmpty({ groupId: 'group-1', client });

    expect(result.status).toBe('skipped');
    expect(asked).toBe(false);
  });

  test('does not seed a room that already has content', async () => {
    // A student got there first. Seeding now would duplicate their work.
    const { client, puts } = fakeClient({
      state: htmlToYUpdate('<p>Typed before the seed landed.</p>'),
    });

    const result = await seedGroupRoomIfEmpty({ groupId: 'group-1', client });

    expect(result.status).toBe('skipped');
    expect(puts).toHaveLength(0);
  });

  test('marks a non-empty room seeded so it is not re-read every time', async () => {
    const { client } = fakeClient({
      state: htmlToYUpdate('<p>Already has content.</p>'),
    });

    await seedGroupRoomIfEmpty({ groupId: 'group-1', client });

    expect(prisma.documentGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { seededAt: expect.any(Date) },
    });
  });

  test('leaves an empty document eligible to seed later', async () => {
    // Nothing to seed now, but the draft may gain content before anyone opens
    // it, so this must not be marked done.
    prisma.documentGroup.findUnique.mockResolvedValue(
      group({ document: { html: '' } })
    );
    const { client, puts } = fakeClient({ state: null });

    const result = await seedGroupRoomIfEmpty({ groupId: 'group-1', client });

    expect(result.status).toBe('skipped');
    expect(puts).toHaveLength(0);
    expect(prisma.documentGroup.update).not.toHaveBeenCalled();
  });

  test('skips a group with no document', async () => {
    prisma.documentGroup.findUnique.mockResolvedValue(
      group({ documentId: null, document: null })
    );
    const { client, puts } = fakeClient();

    expect(
      (await seedGroupRoomIfEmpty({ groupId: 'group-1', client })).status
    ).toBe('skipped');
    expect(puts).toHaveLength(0);
  });

  test('throws for a group that does not exist', async () => {
    prisma.documentGroup.findUnique.mockResolvedValue(null);

    await expect(
      seedGroupRoomIfEmpty({ groupId: 'nope', client: fakeClient().client })
    ).rejects.toThrow(SeedError);
  });

  test('treats undecodable room state as not empty', async () => {
    // Fail closed. Refusing to seed is recoverable; duplicating an essay is not.
    const { client, puts } = fakeClient({
      state: new Uint8Array([9, 9, 9, 9]),
    });

    expect(
      (await seedGroupRoomIfEmpty({ groupId: 'group-1', client })).status
    ).toBe('skipped');
    expect(puts).toHaveLength(0);
  });
});
