import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUniqueOrThrow: mock(),
  },
  document: {
    findUniqueOrThrow: mock(),
    findUnique: mock(),
    update: mock(),
  },
  documentRevision: {
    findFirst: mock(),
    create: mock(),
  },
  submission: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
  documentWriteJournal: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

describe('api.model.document.$id', () => {
  beforeEach(() => {
    prisma.user.findUniqueOrThrow.mockReset();
    prisma.document.findUniqueOrThrow.mockReset();
    prisma.document.findUnique.mockReset();
    prisma.document.update.mockReset();
    prisma.documentRevision.findFirst.mockReset();
    prisma.documentRevision.create.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submission.create.mockReset();
    prisma.submission.update.mockReset();
    prisma.documentWriteJournal.findFirst.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.document.findUniqueOrThrow.mockResolvedValue({
      id: 'doc-1',
      profileId: 'profile-1',
      text: 'Old text',
      html: '<p>Old text</p>',
      revision: 4,
    });
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      text: 'New text',
      html: '<p>New text</p>',
      revision: 5,
    });
    prisma.documentRevision.findFirst.mockResolvedValue(null);
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      revision: 5,
    });
    prisma.documentWriteJournal.create.mockResolvedValue({
      id: 'journal-1',
    });
    prisma.documentWriteJournal.update.mockResolvedValue({
      id: 'journal-1',
      status: 'accepted',
    });
  });

  test('rejects stale editor saves and records a rejected journal entry', async () => {
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-old',
      editorSessionId: 'editor-1',
      clientSeq: 7,
      status: 'accepted',
    });

    const form = new FormData();
    form.append('html', '<p>Older content</p>');
    form.append('text', 'Older content');
    form.append('editorSessionId', 'editor-1');
    form.append('clientSeq', '6');
    form.append('baseRevision', '4');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?from=editor',
        {
          method: 'PUT',
          body: form,
        }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(409);
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      {
        where: { id: 'journal-1' },
        data: {
          status: 'rejected',
          failureReason: 'stale_client_sequence',
        },
      }
    );
  });

  test('accepts ordered editor saves, increments revision, and returns the new revision', async () => {
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-old',
      editorSessionId: 'editor-1',
      clientSeq: 3,
      status: 'accepted',
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      revision: 5,
    });

    const form = new FormData();
    form.append('html', '<p>Newest content</p>');
    form.append('text', 'Newest content');
    form.append('editorSessionId', 'editor-1');
    form.append('clientSeq', '4');
    form.append('baseRevision', '4');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?from=editor',
        {
          method: 'PUT',
          body: form,
        }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
    expect(prisma.document.update.mock.calls[0]?.[0]).toMatchObject({
      where: {
        revision: 4,
        id: 'doc-1',
      },
      data: {
        html: '<p>Newest content</p>',
        text: 'Newest content',
        revision: {
          increment: 1,
        },
      },
    });

    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      revision: 5,
    });
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      {
        where: { id: 'journal-1' },
        data: {
          status: 'accepted',
          resultingRevision: 5,
        },
      }
    );
  });

  test('returns a stale revision conflict when the guarded update loses the race', async () => {
    prisma.documentWriteJournal.findFirst.mockResolvedValue({
      id: 'journal-old',
      editorSessionId: 'editor-1',
      clientSeq: 3,
      status: 'accepted',
    });
    prisma.document.update.mockRejectedValue(
      Object.assign(new Error('No record was found for an update.'), {
        code: 'P2025',
      })
    );

    const form = new FormData();
    form.append('html', '<p>Newest content</p>');
    form.append('text', 'Newest content');
    form.append('editorSessionId', 'editor-1');
    form.append('clientSeq', '4');
    form.append('baseRevision', '4');

    const response = (await action({
      request: new Request(
        'https://example.com/api/model/document/doc-1?from=editor',
        {
          method: 'PUT',
          body: form,
        }
      ),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(409);
    expect(
      prisma.documentWriteJournal.update.mock.calls.at(-1)?.[0]
    ).toMatchObject({
      where: { id: 'journal-1' },
      data: {
        status: 'rejected',
        failureReason: 'stale_base_revision',
      },
    });
  });
});
