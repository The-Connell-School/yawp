import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
    update: mock(),
  },
  featureAccessTarget: {
    deleteMany: mock(),
    upsert: mock(),
  },
  teacherProfile: {
    findUnique: mock(),
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
    prisma.featureAccessTarget.deleteMany.mockReset();
    prisma.featureAccessTarget.upsert.mockReset();
    prisma.teacherProfile.findUnique.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    prisma.assignmentType.findUnique.mockResolvedValue({ id: 'at-1' });
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 'teacher-1' });
    prisma.featureAccessTarget.upsert.mockResolvedValue({
      id: 'fat-1',
      featureKey: 'assignment_type:at-1',
      targetKind: 'teacher',
      targetId: 'teacher-1',
      enabled: true,
    });
  });

  test('archives assignment types instead of hard deleting them', async () => {
    const form = new FormData();
    form.set('intent', 'deleteCourse');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        {
          method: 'POST',
          body: form,
        }
      ),
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
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: { archivedAt: null },
    });
  });

  test('sets a teacher-level assignment type access override', async () => {
    const form = new FormData();
    form.set('intent', 'setTeacherAccess');
    form.set('teacherProfileId', 'teacher-1');
    form.set('access', 'enabled');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      select: { id: true },
    });
    expect(prisma.teacherProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'teacher-1' },
      select: { id: true },
    });
    expect(prisma.featureAccessTarget.upsert).toHaveBeenCalledWith({
      where: {
        featureKey_targetKind_targetId: {
          featureKey: 'assignment_type:at-1',
          targetKind: 'teacher',
          targetId: 'teacher-1',
        },
      },
      create: {
        featureKey: 'assignment_type:at-1',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: true,
        expiresAt: null,
      },
      update: {
        enabled: true,
        expiresAt: null,
        updatedAt: expect.any(Date),
      },
    });
    expect(response.data).toMatchObject({ status: 'success' });
  });

  test('clears a teacher-level assignment type access override', async () => {
    const form = new FormData();
    form.set('intent', 'setTeacherAccess');
    form.set('teacherProfileId', 'teacher-1');
    form.set('access', 'default');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.featureAccessTarget.deleteMany).toHaveBeenCalledWith({
      where: {
        featureKey: 'assignment_type:at-1',
        targetKind: 'teacher',
        targetId: 'teacher-1',
      },
    });
    expect(response.data).toMatchObject({ status: 'success' });
  });
});
