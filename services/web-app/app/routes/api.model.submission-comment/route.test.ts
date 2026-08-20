import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  user: { findUnique: mock() },
  submission: { findFirst: mock() },
  submissionComment: { create: mock() },
  submissionActivity: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { action } = await import('./route');

describe('api.model.submission-comment', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submissionComment.create.mockReset();
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

  test('creates a submission comment', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      releasedAt: new Date('2026-08-20T11:00:00.000Z'),
      document: { membership: { organizationId: 'org-1' } },
    });
    prisma.submissionComment.create.mockResolvedValue({
      id: 'comment-1',
      content: 'Great point here.',
      excerpt: 'the thesis',
      occurrence: 1,
      submissionId: 'sub-1',
      profileId: 'profile-1',
    });

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    form.append('content', 'Great point here.');
    form.append('excerpt', 'the thesis');

    const response = await action({
      request: new Request('https://example.com/api/model/submission-comment', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const payload = (response as { data: Record<string, unknown>; init?: { status?: number } });
    expect(payload.init?.status).toBe(201);
    expect(payload.data.success).toBe(true);
    expect((payload.data.comment as any).id).toBe('comment-1');
    expect(prisma.submissionComment.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        eventType: 'submission.comment_created',
        occurredAfterRelease: true,
        changes: {
          comment: {
            before: null,
            after: expect.objectContaining({ content: 'Great point here.' }),
          },
        },
      })
    );
  });

  test('returns 403 when submission not found or user not authorized', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const form = new FormData();
    form.append('submissionId', 'sub-nonexistent');
    form.append('content', 'A comment');
    form.append('excerpt', 'some text');

    const response = await action({
      request: new Request('https://example.com/api/model/submission-comment', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const payload = (response as { data: Record<string, unknown>; init?: { status?: number } });
    expect(payload.init?.status).toBe(403);
  });
});
