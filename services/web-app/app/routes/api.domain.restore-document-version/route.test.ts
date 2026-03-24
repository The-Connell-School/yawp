import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  documentVersion: {
    findFirst: mock(),
    create: mock(),
  },
  documentSnapshot: {
    findFirst: mock(),
  },
  document: {
    update: mock(),
  },
  documentWriteJournal: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
};

const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: (to: string, payload: unknown) =>
    new Response(JSON.stringify({ to, payload }), {
      status: 302,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

const { action } = await import('./route');

describe('api.domain.restore-document-version', () => {
  beforeEach(() => {
    prisma.documentVersion.findFirst.mockReset();
    prisma.documentVersion.create.mockReset();
    prisma.documentSnapshot.findFirst.mockReset();
    prisma.document.update.mockReset();
    prisma.documentWriteJournal.findFirst.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    requireUserId.mockReset();

    requireUserId.mockResolvedValue('user-1');
    prisma.documentVersion.findFirst.mockResolvedValue({
      id: 'version-1',
      documentId: 'doc-1',
      html: '<p>Restored draft</p>',
      text: 'Restored draft',
      document: {
        id: 'doc-1',
        title: 'Essay',
        html: '<p>Current draft</p>',
        text: 'Current draft',
        revision: 8,
      },
    });
    prisma.documentSnapshot.findFirst.mockResolvedValue(null);
    prisma.documentWriteJournal.findFirst.mockResolvedValue(null);
    prisma.documentWriteJournal.create.mockResolvedValue({ id: 'journal-1' });
    prisma.documentWriteJournal.update.mockResolvedValue({
      id: 'journal-1',
      status: 'accepted',
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      html: '<p>Restored draft</p>',
      text: 'Restored draft',
      revision: 9,
    });
  });

  test('restores a version and journals the recovery write', async () => {
    const form = new FormData();
    form.append('versionId', 'version-1');

    const response = (await action({
      request: new Request(
        'https://example.com/api/domain/restore-document-version',
        {
          method: 'POST',
          body: form,
        }
      ),
    } as any)) as {
      data: {
        doc: {
          id: string;
          revision: number;
        };
      };
    };

    expect(response.data.doc).toMatchObject({
      id: 'doc-1',
      revision: 9,
    });
    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        eventType: 'document.restore',
        source: 'restore-document-version',
        status: 'pending',
        documentId: 'doc-1',
        title: 'Essay',
        html: '<p>Restored draft</p>',
        text: 'Restored draft',
        baseRevision: 8,
      },
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        html: '<p>Restored draft</p>',
        text: 'Restored draft',
        revision: { increment: 1 },
      },
    });
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'journal-1' },
      data: {
        status: 'accepted',
        resultingRevision: 9,
      },
    });
  });

  test('restores from a journal entry when no version or snapshot matches', async () => {
    prisma.documentVersion.findFirst.mockResolvedValue(null);
    prisma.documentSnapshot.findFirst.mockResolvedValue(null);
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-entry-1',
      documentId: 'doc-1',
      html: '<p>Journal content</p>',
      text: 'Journal content',
      document: {
        id: 'doc-1',
        title: 'Essay',
        html: '<p>Current draft</p>',
        text: 'Current draft',
        revision: 5,
      },
    });

    const form = new FormData();
    form.append('versionId', 'journal-entry-1');

    const response = (await action({
      request: new Request(
        'https://example.com/api/domain/restore-document-version',
        { method: 'POST', body: form }
      ),
    } as any)) as { data: { doc: { id: string; revision: number } } };

    expect(response.data.doc).toMatchObject({ id: 'doc-1', revision: 9 });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        html: '<p>Journal content</p>',
        text: 'Journal content',
        revision: { increment: 1 },
      },
    });
    // Verify pre-restore backup was created
    expect(prisma.documentVersion.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        html: '<p>Current draft</p>',
        text: 'Current draft',
      },
    });
    // Verify journal metadata uses 'journal' type
    expect(prisma.documentWriteJournal.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        eventType: 'document.restore',
        metadata: expect.objectContaining({
          restoredFromType: 'journal',
        }),
      },
    });
  });

  test('returns error when no version, snapshot, or journal entry matches', async () => {
    prisma.documentVersion.findFirst.mockResolvedValue(null);
    prisma.documentSnapshot.findFirst.mockResolvedValue(null);
    prisma.documentWriteJournal.findFirst.mockResolvedValue(null);

    const form = new FormData();
    form.append('versionId', 'nonexistent-id');

    const response = await action({
      request: new Request(
        'https://example.com/api/domain/restore-document-version',
        { method: 'POST', body: form }
      ),
    } as any);

    expect(response.status).toBe(302);
    const body = await response.json();
    expect(body.payload).toMatchObject({
      description: 'Document version not found.',
      type: 'error',
    });
  });

  test('creates pre-restore DocumentVersion backup before restoring from journal', async () => {
    prisma.documentVersion.findFirst.mockResolvedValue(null);
    prisma.documentSnapshot.findFirst.mockResolvedValue(null);
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-entry-2',
      documentId: 'doc-1',
      html: '<p>Journal v2</p>',
      text: 'Journal v2',
      document: {
        id: 'doc-1',
        title: 'Essay',
        html: '<p>Before restore</p>',
        text: 'Before restore',
        revision: 3,
      },
    });

    const form = new FormData();
    form.append('versionId', 'journal-entry-2');

    await action({
      request: new Request(
        'https://example.com/api/domain/restore-document-version',
        { method: 'POST', body: form }
      ),
    } as any);

    // Pre-restore backup captures the document's CURRENT content, not the journal's
    expect(prisma.documentVersion.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        html: '<p>Before restore</p>',
        text: 'Before restore',
      },
    });
  });
});
