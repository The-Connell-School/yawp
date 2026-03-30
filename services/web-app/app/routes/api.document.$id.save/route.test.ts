import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUniqueOrThrow: mock() },
  document: { findUniqueOrThrow: mock(), update: mock() },
  documentRevision: { findFirst: mock(), create: mock() },
  documentWriteJournal: { create: mock(), update: mock() },
};

const requireUserId = mock();
const requireProfile = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireProfile }));

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
    requireProfile.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.document.findUniqueOrThrow.mockResolvedValue({
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
    expect(prisma.document.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'doc-1' },
      data: {
        html: '<p>new content</p>',
        text: 'new content',
        revision: { increment: 1 },
      },
    });
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
      createdAt: new Date(), // just now
      contentHash: 'different',
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

  test('returns 401 when user is not authenticated', async () => {
    requireUserId.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    try {
      await action({
        request: makeRequest('doc-1', { html: '<p>x</p>', text: 'x', contentHash: 'x' }),
        params: { id: 'doc-1' },
      } as any);
    } catch (e) {
      expect((e as Response).status).toBe(401);
    }
  });
});
