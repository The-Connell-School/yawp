import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentSnapshot: { findMany: mock() },
  documentVersion: { findMany: mock() },
  documentWriteJournal: { findMany: mock() },
};

const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId }));
mock.module('~/utils/audit.server', () => ({
  auditLoader: (handler: any) => handler,
}));

const { loader } = await import('./route');

describe('api.model.document.$id.versions', () => {
  beforeEach(() => {
    prisma.documentSnapshot.findMany.mockReset();
    prisma.documentVersion.findMany.mockReset();
    prisma.documentWriteJournal.findMany.mockReset();
    requireUserId.mockReset();
    requireUserId.mockResolvedValue('user-1');
  });

  test('returns journal entries when mode=journal', async () => {
    const journalEntries = [
      {
        id: 'j1',
        createdAt: new Date(),
        eventType: 'document.save',
        status: 'accepted',
        failureReason: null,
        title: 'My Essay',
        html: '<p>Content</p>',
        text: 'Content',
      },
    ];
    prisma.documentWriteJournal.findMany.mockResolvedValue(journalEntries);

    const response = await loader({
      request: new Request(
        'https://example.com/api/model/document/doc-1/versions?mode=journal&page=1&limit=5'
      ),
      params: { id: 'doc-1' },
    } as any);

    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].eventType).toBe('document.save');
    expect(prisma.documentWriteJournal.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 5,
      select: {
        id: true,
        createdAt: true,
        eventType: true,
        status: true,
        failureReason: true,
        title: true,
        html: true,
        text: true,
      },
    });
    // Verify other models were NOT queried
    expect(prisma.documentSnapshot.findMany).not.toHaveBeenCalled();
    expect(prisma.documentVersion.findMany).not.toHaveBeenCalled();
  });

  test('returns document versions when mode is not specified', async () => {
    const versions = [
      { id: 'v1', createdAt: new Date(), html: '<p>V1</p>', text: 'V1' },
    ];
    prisma.documentVersion.findMany.mockResolvedValue(versions);

    const response = await loader({
      request: new Request(
        'https://example.com/api/model/document/doc-1/versions?page=1&limit=5'
      ),
      params: { id: 'doc-1' },
    } as any);

    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(prisma.documentVersion.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 5,
    });
    expect(prisma.documentSnapshot.findMany).not.toHaveBeenCalled();
    expect(prisma.documentWriteJournal.findMany).not.toHaveBeenCalled();
  });

  test('returns snapshots when mode=snapshots', async () => {
    const snapshots = [
      { id: 's1', createdAt: new Date(), html: '<p>S1</p>', text: 'S1' },
    ];
    prisma.documentSnapshot.findMany.mockResolvedValue(snapshots);

    const response = await loader({
      request: new Request(
        'https://example.com/api/model/document/doc-1/versions?mode=snapshots&page=2&limit=5'
      ),
      params: { id: 'doc-1' },
    } as any);

    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(prisma.documentSnapshot.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      take: 5,
    });
    expect(prisma.documentVersion.findMany).not.toHaveBeenCalled();
    expect(prisma.documentWriteJournal.findMany).not.toHaveBeenCalled();
  });
});
