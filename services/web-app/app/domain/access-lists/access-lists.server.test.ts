import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  accessListEntry: {
    findFirst: mock(),
    findUnique: mock(),
    findMany: mock(),
    upsert: mock(),
    delete: mock(),
  },
  adminConfigAudit: {
    create: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  isOnAccessList,
  addAccessListEntry,
  removeAccessListEntry,
} = await import('./access-lists.server');

describe('isOnAccessList', () => {
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    prisma.accessListEntry.findFirst.mockReset();
    prisma.accessListEntry.findUnique.mockReset();
  });

  test('matches by userId first', async () => {
    prisma.accessListEntry.findFirst.mockResolvedValue({ id: '1' });
    expect(
      await isOnAccessList('teacher_lounge', {
        userId: 'user-1',
        email: 'a@b.com',
      })
    ).toBe(true);
    expect(prisma.accessListEntry.findUnique.mock.calls.length).toBe(0);
  });

  test('falls back to normalized email', async () => {
    prisma.accessListEntry.findFirst.mockResolvedValue(null);
    prisma.accessListEntry.findUnique.mockResolvedValue({ id: '2' });
    expect(
      await isOnAccessList('teacher_lounge', {
        email: 'Eric@Example.com',
      })
    ).toBe(true);
    expect(prisma.accessListEntry.findUnique.mock.calls[0]?.[0]).toEqual({
      where: {
        listKey_email: { listKey: 'teacher_lounge', email: 'eric@example.com' },
      },
      select: { id: true },
    });
  });
});

describe('access list mutations audit', () => {
  beforeEach(() => {
    mock.module('~/utils/db.server', () => ({ prisma }));
    prisma.accessListEntry.findUnique.mockReset();
    prisma.accessListEntry.upsert.mockReset();
    prisma.accessListEntry.delete.mockReset();
    prisma.adminConfigAudit.create.mockReset();
    prisma.accessListEntry.findUnique.mockResolvedValue(null);
    prisma.accessListEntry.upsert.mockResolvedValue({
      id: 'entry-1',
      listKey: 'teacher_lounge',
      userId: null,
      email: 'new@example.com',
      note: null,
      createdAt: new Date(),
      createdByUserId: null,
    });
    prisma.adminConfigAudit.create.mockResolvedValue({ id: 'audit-1' });
  });

  test('addAccessListEntry writes AdminConfigAudit', async () => {
    await addAccessListEntry(
      'teacher_lounge',
      { email: 'New@Example.com' },
      { actorEmail: 'ops@yawp.school', source: 'internal_api' }
    );
    expect(prisma.adminConfigAudit.create.mock.calls[0]?.[0].data).toMatchObject({
      entityType: 'access_list',
      entityKey: 'teacher_lounge',
      action: 'add',
      actorEmail: 'ops@yawp.school',
      source: 'internal_api',
    });
  });

  test('removeAccessListEntry writes AdminConfigAudit when a row existed', async () => {
    prisma.accessListEntry.findUnique.mockResolvedValue({
      email: 'gone@example.com',
      userId: null,
      note: null,
    });
    await removeAccessListEntry('teacher_lounge', 'gone@example.com', {
      actorEmail: 'ops@yawp.school',
      source: 'internal_api',
    });
    expect(prisma.adminConfigAudit.create.mock.calls[0]?.[0].data).toMatchObject({
      action: 'remove',
      before: { email: 'gone@example.com' },
    });
  });
});
