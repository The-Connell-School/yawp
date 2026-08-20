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
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

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

    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };
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

    const payload = response as {
      data: Record<string, unknown>;
      init?: { status?: number };
    };
    expect(payload.init?.status).toBe(403);
  });

  test('returns 409 and writes nothing when teacher access is revoked before create', async () => {
    prisma.submission.findFirst
      .mockResolvedValueOnce({
        id: 'sub-1',
        releasedAt: null,
        document: { membership: { organizationId: 'org-1' } },
      })
      .mockResolvedValueOnce(null);

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    form.append('content', 'A comment');
    form.append('excerpt', 'some text');

    const response = await action({
      request: new Request('https://example.com/api/model/submission-comment', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as { init?: { status?: number } }).init?.status).toBe(409);
    expect(prisma.submissionComment.create).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('preserves platform-admin cross-tenant comment creation with tenant-safe activity attribution', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ isAdmin: true })
      .mockResolvedValueOnce({
        name: 'Platform Admin',
        email: 'platform-admin@example.test',
      });
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-cross-tenant',
      releasedAt: new Date('2026-08-20T11:00:00.000Z'),
      document: { membership: { organizationId: 'org-2' } },
    });
    prisma.submissionComment.create.mockResolvedValue({
      id: 'comment-cross-tenant',
      content: 'A comment',
      excerpt: 'some text',
      occurrence: 1,
      submissionId: 'sub-cross-tenant',
      profileId: 'profile-1',
    });

    const form = new FormData();
    form.append('submissionId', 'sub-cross-tenant');
    form.append('content', 'A comment');
    form.append('excerpt', 'some text');

    const response = await action({
      request: new Request('https://example.com/api/model/submission-comment', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as { init?: { status?: number } }).init?.status).toBe(201);
    expect(
      JSON.stringify(prisma.submission.findFirst.mock.calls[0][0].where)
    ).not.toContain('organizationId');
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        organizationId: 'org-2',
        actorMembershipId: null,
        actorType: 'human',
        actorName: 'Platform Admin',
        actorEmail: 'platform-admin@example.test',
      })
    );
    expect(prisma.submissionComment.create).toHaveBeenCalledTimes(1);
  });
});
