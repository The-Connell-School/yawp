import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: { findUnique: mock() },
  submissionComment: { findFirst: mock(), delete: mock() },
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
    prisma.submissionComment.delete.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
  });

  test('deletes a submission comment', async () => {
    prisma.submissionComment.findFirst.mockResolvedValue({ id: 'comment-1' });
    prisma.submissionComment.delete.mockResolvedValue({ id: 'comment-1' });

    const response = await action({
      request: new Request(
        'https://example.com/api/model/submission-comment/comment-1',
        { method: 'DELETE' }
      ),
      params: { id: 'comment-1' },
    } as any);

    const payload = response as { data: Record<string, unknown> };
    expect(payload.data.success).toBe(true);
    expect(prisma.submissionComment.delete).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
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

    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };
    expect(payload.init?.status).toBe(404);
  });
});
