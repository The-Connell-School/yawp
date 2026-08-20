import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  submission: {
    findFirst: mock(),
    updateMany: mock(),
  },
  user: {
    findUnique: mock(),
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

describe('api.model.submission.$id', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.submission.updateMany.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.$transaction.mockReset();
    prisma.submissionActivity.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-student',
      organization: { id: 'org-1' },
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  // Archive is retired: Unsubmit is the single way a student takes a
  // submission out of active state. These intents must not be reachable
  // even if a client still POSTs them directly.
  test('intent=archive is no longer supported', async () => {
    const form = new FormData();
    form.set('intent', 'archive');
    const res = await action({
      request: new Request('https://example.com/api/model/submission/sub-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'sub-1' },
      context: {},
    } as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(prisma.submission.findFirst).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('intent=unarchive is no longer supported', async () => {
    const form = new FormData();
    form.set('intent', 'unarchive');
    const res = await action({
      request: new Request('https://example.com/api/model/submission/sub-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'sub-1' },
      context: {},
    } as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(prisma.submission.findFirst).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('400 when intent=updateTitle but title is not a string', async () => {
    const form = new FormData();
    form.set('intent', 'updateTitle');
    const res = await action({
      request: new Request('https://example.com/api/model/submission/sub-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'sub-1' },
      context: {},
    } as any);

    expect(res.status).toBe(400);
  });

  test('updates title when intent=updateTitle and viewer has access', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      title: 'Old title',
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      releasedAt: new Date('2026-08-20T11:00:00.000Z'),
      document: { membership: { organizationId: 'org-1' } },
    });

    const form = new FormData();
    form.set('intent', 'updateTitle');
    form.set('title', '  My essay  ');
    const res = await action({
      request: new Request('https://example.com/api/model/submission/sub-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'sub-1' },
      context: {},
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(prisma.submission.updateMany).toHaveBeenCalled();
    const updateArg = prisma.submission.updateMany.mock.calls[0][0];
    expect(updateArg.data.title).toBe('My essay');
    expect(updateArg.where.document).toEqual(
      expect.objectContaining({ is: expect.any(Object) })
    );
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        eventType: 'submission.title_updated',
        occurredAfterRelease: true,
        changes: {
          title: { before: 'Old title', after: 'My essay' },
        },
      })
    );
  });

  test('returns 409 and writes no activity when the title preimage is stale', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      title: 'Old title',
      updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      releasedAt: null,
      document: { membership: { organizationId: 'org-1' } },
    });
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });
    const form = new FormData();
    form.set('intent', 'updateTitle');
    form.set('title', 'Concurrent title');

    const response = await action({
      request: new Request('https://example.com/api/model/submission/sub-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'sub-1' },
      context: {},
    } as any);

    expect(response.status).toBe(409);
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('404 updateTitle when submission not accessible', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const form = new FormData();
    form.set('intent', 'updateTitle');
    form.set('title', 'x');
    const res = await action({
      request: new Request('https://example.com/api/model/submission/missing', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'missing' },
      context: {},
    } as any);

    expect(res.status).toBe(404);
  });
});
