import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
    update: mock(),
  },
};

const requireAdmin = mock();
const requireUserId = mock();
const requireProfile = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/auth.server.js', () => ({
  requireAdmin,
  requireUserId,
  requireProfile,
}));

const { action: routeAction } = await import('./route');
const action = routeAction as any;

describe('admin assignment type detail action', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentType.update.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('archives assignment types instead of hard deleting them', async () => {
    const form = new FormData();
    form.set('intent', 'deleteCourse');

    const response = await action({
      request: new Request('https://example.test/app/admin/assignment-types/at-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: { archivedAt: expect.any(Date) },
    });
    const redirectResponse = response as Response;
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get('Location')).toBe(
      '/app/admin/assignment-types'
    );
  });

  test('unarchives assignment types when requested', async () => {
    const form = new FormData();
    form.set('intent', 'unarchiveCourse');

    await action({
      request: new Request('https://example.test/app/admin/assignment-types/at-1', {
        method: 'POST',
        body: form,
      }),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: { archivedAt: null },
    });
  });
});
