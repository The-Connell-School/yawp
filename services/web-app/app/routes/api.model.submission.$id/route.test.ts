import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: {
    findFirst: mock(),
    update: mock(),
  },
  user: {
    findUnique: mock(),
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

describe('api.model.submission.$id', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.submission.update.mockReset();
    prisma.user.findUnique.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-student' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
  });

  test('archives when intent=archive and student owns document', async () => {
    prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1' });
    prisma.submission.update.mockResolvedValue({} as any);

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

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(prisma.submission.update).toHaveBeenCalled();
    const updateArg = prisma.submission.update.mock.calls[0][0];
    expect(updateArg.data.archivedAt).toBeInstanceOf(Date);
  });

  test('unarchive clears archivedAt', async () => {
    prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1' });
    prisma.submission.update.mockResolvedValue({} as any);

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

    expect(res.status).toBe(200);
    const updateArg = prisma.submission.update.mock.calls[0][0];
    expect(updateArg.data.archivedAt).toBeNull();
  });

  test('404 when submission not found for owner', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const form = new FormData();
    form.set('intent', 'archive');
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
    prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1' });
    prisma.submission.update.mockResolvedValue({} as any);

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
    expect(prisma.submission.update).toHaveBeenCalled();
    const updateArg = prisma.submission.update.mock.calls[0][0];
    expect(updateArg.data.title).toBe('My essay');
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
