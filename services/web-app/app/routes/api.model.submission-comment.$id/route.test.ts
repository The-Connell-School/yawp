import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  user: { findUnique: mock() },
  submissionComment: { findFirst: mock(), delete: mock(), update: mock() },
  submissionActivity: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { action } = await import('./route');

describe('api.model.submission-comment.$id', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.submissionComment.findFirst.mockReset();
    prisma.submissionComment.delete.mockReset();
    prisma.submissionComment.update.mockReset();
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
      submission: {
        id: 'sub-1',
        releasedAt: new Date('2026-08-20T11:00:00.000Z'),
        document: { membership: { organizationId: 'org-1' } },
      },
    });
    prisma.submissionComment.delete.mockResolvedValue({ id: 'comment-1' });

    const response = await action({
      request: new Request(
        'https://example.com/api/model/submission-comment/comment-1',
        { method: 'DELETE' }
      ),
      params: { id: 'comment-1' },
    } as any);

    const payload = (response as { data: Record<string, unknown> });
    expect(payload.data.success).toBe(true);
    expect(prisma.submissionComment.delete).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
    });
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create.mock.calls[0][0].data.changes).toEqual({
      comment: {
        before: expect.objectContaining({ content: 'Keep this snapshot.' }),
        after: null,
      },
    });
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

    const payload = (response as { data: Record<string, unknown>; init?: { status?: number } });
    expect(payload.init?.status).toBe(404);
  });
});
