import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  user: { findUnique: mock() },
  submissionComment: {
    findFirst: mock(),
    deleteMany: mock(),
    updateMany: mock(),
  },
  submissionActivity: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

describe('api.model.submission-comment.$id', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.submissionComment.findFirst.mockReset();
    prisma.submissionComment.deleteMany.mockReset();
    prisma.submissionComment.updateMany.mockReset();
    prisma.submissionActivity.create.mockReset();
    prisma.$transaction.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.submissionComment.deleteMany.mockResolvedValue({ count: 1 });
    prisma.submissionComment.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  test('deletes a submission comment', async () => {
    prisma.submissionComment.findFirst.mockResolvedValue({
      id: 'comment-1',
      content: 'Keep this snapshot.',
      excerpt: 'the thesis',
      occurrence: 1,
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      submission: {
        id: 'sub-1',
        releasedAt: new Date('2026-08-20T11:00:00.000Z'),
        document: { membership: { organizationId: 'org-1' } },
      },
    });
    const response = await action({
      request: new Request(
        'https://example.com/api/model/submission-comment/comment-1',
        { method: 'DELETE' }
      ),
      params: { id: 'comment-1' },
    } as any);

    const payload = response as { data: Record<string, unknown> };
    expect(payload.data.success).toBe(true);
    expect(prisma.submissionComment.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'comment-1',
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
    });
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.submissionActivity.create.mock.calls[0][0].data.changes
    ).toEqual({
      comment: {
        before: expect.objectContaining({ content: 'Keep this snapshot.' }),
        after: null,
      },
    });
  });

  test('returns 409 and writes no activity when delete preimage is stale', async () => {
    prisma.submissionComment.findFirst.mockResolvedValue({
      id: 'comment-1',
      content: 'Concurrent content',
      excerpt: 'the thesis',
      occurrence: 1,
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      submission: {
        id: 'sub-1',
        releasedAt: null,
        document: { membership: { organizationId: 'org-1' } },
      },
    });
    prisma.submissionComment.deleteMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: new Request(
        'https://example.com/api/model/submission-comment/comment-1',
        { method: 'DELETE' }
      ),
      params: { id: 'comment-1' },
    } as any);

    const payload = response as { init?: { status?: number } };
    expect(payload.init?.status).toBe(409);
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('returns 409 and writes no activity when update preimage is stale', async () => {
    prisma.submissionComment.findFirst.mockResolvedValue({
      id: 'comment-1',
      content: 'Original content',
      excerpt: 'the thesis',
      occurrence: 1,
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      submission: {
        id: 'sub-1',
        releasedAt: null,
        document: { membership: { organizationId: 'org-1' } },
      },
    });
    prisma.submissionComment.updateMany.mockResolvedValue({ count: 0 });
    const form = new FormData();
    form.set('content', 'Changed content');

    const response = await action({
      request: new Request(
        'https://example.com/api/model/submission-comment/comment-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'comment-1' },
    } as any);

    const payload = response as { init?: { status?: number } };
    expect(payload.init?.status).toBe(409);
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('audits a post-release comment edit with exact before and after content', async () => {
    prisma.submissionComment.findFirst.mockResolvedValue({
      id: 'comment-1',
      content: 'Original content',
      excerpt: 'the thesis',
      occurrence: 1,
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      submission: {
        id: 'sub-1',
        releasedAt: new Date('2026-08-20T11:00:00.000Z'),
        document: { membership: { organizationId: 'org-1' } },
      },
    });
    const form = new FormData();
    form.set('content', 'Changed content');

    const response = await action({
      request: new Request(
        'https://example.com/api/model/submission-comment/comment-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'comment-1' },
    } as any);

    expect((response as { data: { success: boolean } }).data.success).toBe(
      true
    );
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        eventType: 'submission.comment_updated',
        occurredAfterRelease: true,
        changes: {
          comment: {
            before: { content: 'Original content' },
            after: { content: 'Changed content' },
          },
        },
      })
    );
  });

  test('returns 404 when comment not found', async () => {
    prisma.submissionComment.findFirst.mockResolvedValue(null);

    const response = await action({
      request: new Request(
        'https://example.com/api/model/submission-comment/nonexistent',
        { method: 'DELETE' }
      ),
      params: { id: 'nonexistent' },
    } as any);

    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };
    expect(payload.init?.status).toBe(404);
  });
});
