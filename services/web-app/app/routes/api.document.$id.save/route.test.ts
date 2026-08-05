import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUniqueOrThrow: mock() },
  document: { findFirst: mock(), update: mock() },
  documentRevision: { findFirst: mock(), create: mock() },
  documentWriteJournal: { create: mock(), update: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

function makeRequest(docId: string, body: Record<string, unknown>) {
  return new Request(`https://example.com/api/document/${docId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('api.document.$id.save', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        (fn as ReturnType<typeof mock>).mockReset();
      }
    }
    requireUserId.mockReset();
    requireMembership.mockReset();
    delete process.env.PREVIEW_ACCESS_GATE;
    delete process.env.PREVIEW_DATA_MODE;

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      profileId: 'profile-1',
      html: '<p>old</p>',
      text: 'old',
      revision: 3,
      updatedAt: new Date('2026-01-01'),
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      revision: 4,
      updatedAt: new Date(),
    });
    prisma.documentRevision.findFirst.mockResolvedValue(null);
    prisma.documentRevision.create.mockResolvedValue({ id: 'rev-1' });
    prisma.documentWriteJournal.create.mockResolvedValue({ id: 'j-1' });
    prisma.documentWriteJournal.update.mockResolvedValue({ id: 'j-1' });
  });

  test('saves document and returns new revision', async () => {
    const response = (await action({
      request: makeRequest('doc-1', {
        html: '<p>new content</p>',
        text: 'new content',
        contentHash: 'abc123',
      }),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.revision).toBe(4);
    expect(body.savedAt).toBeDefined();
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
  });

  // Preview seats keep production admin behaviour. Seats stop testers colliding by
  // accident; they are not a security boundary between them, so a platform admin reaches
  // documents here exactly as they would in production -- see hasEffectivePlatformAdmin.
  test('a platform admin keeps production document access inside a preview seat', async () => {
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'seed';
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: true });
    prisma.document.findFirst.mockResolvedValue(null);

    try {
      const response = (await action({
        request: makeRequest('other-seat-doc', {
          html: '<p>changed</p>',
          text: 'changed',
          contentHash: 'abc123',
        }),
        params: { id: 'other-seat-doc' },
      } as any)) as Response;

      expect(response.status).toBe(403);
      expect(prisma.document.findFirst.mock.calls[0]?.[0]?.where).toEqual({
        id: 'other-seat-doc',
      });
      expect(prisma.documentWriteJournal.create).not.toHaveBeenCalled();
    } finally {
      delete process.env.PREVIEW_ACCESS_GATE;
      delete process.env.PREVIEW_DATA_MODE;
    }
  });

  test('a non-admin is still scoped to documents their membership can reach', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: makeRequest('someone-elses-doc', {
        html: '<p>changed</p>',
        text: 'changed',
        contentHash: 'abc123',
      }),
      params: { id: 'someone-elses-doc' },
    } as any)) as Response;

    expect(response.status).toBe(403);
    expect(prisma.document.findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      id: 'someone-elses-doc',
      OR: expect.any(Array),
    });
    expect(prisma.documentWriteJournal.create).not.toHaveBeenCalled();
  });

  test('creates a revision when none exists (session-start)', async () => {
    const response = (await action({
      request: makeRequest('doc-1', {
        html: '<p>new</p>',
        text: 'new',
        contentHash: 'abc',
      }),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.documentRevision.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentRevision.create.mock.calls[0][0].data).toMatchObject({
      documentId: 'doc-1',
      trigger: 'session-start',
    });
  });

  test('skips revision creation when last revision is recent', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      id: 'rev-existing',
      createdAt: new Date(),
    });

    const response = (await action({
      request: makeRequest('doc-1', {
        html: '<p>new</p>',
        text: 'new',
        contentHash: 'new-hash',
      }),
      params: { id: 'doc-1' },
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
  });

  test('creates journal entry for audit', async () => {
    await action({
      request: makeRequest('doc-1', {
        html: '<p>new</p>',
        text: 'new',
        contentHash: 'abc',
      }),
      params: { id: 'doc-1' },
    } as any);

    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(1);
  });

  test('periodic trigger creates a revision when content has changed', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago — well under 30min interval
      html: '<p>old</p>', // OLD content
      text: 'old',
    });

    const res = await action({
      request: makeRequest('doc-1', {
        html: '<p>new content</p>', // DIFFERENT content
        text: 'new content',
        contentHash: 'abc',
        trigger: 'periodic',
      }),
      params: { id: 'doc-1' },
    } as any);

    expect(res.status).toBe(200);
    expect(prisma.documentRevision.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          html: '<p>new content</p>',
          text: 'new content',
          trigger: 'periodic',
        }),
      })
    );
  });

  test('periodic trigger skips revision when content hash matches last revision', async () => {
    prisma.documentRevision.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
      html: '<p>same</p>', // SAME content
      text: 'same',
    });

    const res = await action({
      request: makeRequest('doc-1', {
        html: '<p>same</p>', // IDENTICAL content
        text: 'same',
        contentHash: 'abc',
        trigger: 'periodic',
      }),
      params: { id: 'doc-1' },
    } as any);

    expect(res.status).toBe(200);
    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
  });
});
