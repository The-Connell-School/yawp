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
});
