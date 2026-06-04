import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: {
    findUnique: mock(),
    update: mock(),
  },
  featureAccessTarget: {
    deleteMany: mock(),
    findMany: mock(),
    upsert: mock(),
  },
  teacherProfile: {
    findMany: mock(),
    findUnique: mock(),
  },
  gradingAssistantTemplate: {
    findMany: mock(),
    findUnique: mock(),
  },
  assignmentTypeGradingAssistant: {
    create: mock(),
    updateMany: mock(),
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

const { action: routeAction, loader: routeLoader } = await import('./route');
const action = routeAction as any;
const loader = routeLoader as any;

describe('admin assignment type detail action', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentType.update.mockReset();
    prisma.featureAccessTarget.deleteMany.mockReset();
    prisma.featureAccessTarget.findMany.mockReset();
    prisma.featureAccessTarget.upsert.mockReset();
    prisma.teacherProfile.findMany.mockReset();
    prisma.teacherProfile.findUnique.mockReset();
    prisma.gradingAssistantTemplate.findMany.mockReset();
    prisma.gradingAssistantTemplate.findUnique.mockReset();
    prisma.assignmentTypeGradingAssistant.create.mockReset();
    prisma.assignmentTypeGradingAssistant.updateMany.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();

    requireAdmin.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.assignmentType.findUnique.mockResolvedValue({ id: 'at-1' });
    prisma.teacherProfile.findMany.mockResolvedValue([]);
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 'teacher-1' });
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
    prisma.featureAccessTarget.upsert.mockResolvedValue({
      id: 'fat-1',
      featureKey: 'assignment_type:at-1',
      targetKind: 'teacher',
      targetId: 'teacher-1',
      enabled: true,
    });
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([]);
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

  test('links one default grading assistant template to an assignment type', async () => {
    prisma.gradingAssistantTemplate.findUnique.mockResolvedValue({
      status: 'active',
    });
    const form = new FormData();
    form.set('intent', 'linkGradingAssistant');
    form.set('gradingAssistantTemplateId', 'template-act');

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

    expect(
      prisma.assignmentTypeGradingAssistant.updateMany
    ).toHaveBeenCalledWith({
      where: {
        assignmentTypeId: 'at-1',
        isDefault: true,
        activeTo: null,
      },
      data: { activeTo: expect.any(Date), isDefault: false },
    });
    expect(prisma.assignmentTypeGradingAssistant.create).toHaveBeenCalledWith({
      data: {
        assignmentTypeId: 'at-1',
        gradingAssistantTemplateId: 'template-act',
        isDefault: true,
        activeFrom: expect.any(Date),
      },
    });
  });

  test('rejects non-active grading assistant templates as runtime defaults', async () => {
    prisma.gradingAssistantTemplate.findUnique.mockResolvedValue({
      status: 'draft',
    });
    const form = new FormData();
    form.set('intent', 'linkGradingAssistant');
    form.set('gradingAssistantTemplateId', 'template-draft');

    let thrown: Response | null = null;
    try {
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
    } catch (error) {
      thrown = error as Response;
    }

    expect(thrown?.status).toBe(400);
    expect(
      prisma.assignmentTypeGradingAssistant.updateMany
    ).not.toHaveBeenCalled();
    expect(prisma.assignmentTypeGradingAssistant.create).not.toHaveBeenCalled();
  });

  test('clears the active grading assistant link', async () => {
    const form = new FormData();
    form.set('intent', 'clearGradingAssistant');

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

    expect(
      prisma.assignmentTypeGradingAssistant.updateMany
    ).toHaveBeenCalledWith({
      where: {
        assignmentTypeId: 'at-1',
        isDefault: true,
        activeTo: null,
      },
      data: { activeTo: expect.any(Date), isDefault: false },
    });
    expect(response.data).toMatchObject({ status: 'success' });
  });

  test('loads teacher access rows and only active grading assistant templates', async () => {
    const activeTemplate = {
      id: 'template-active',
      name: 'ACT Writing',
      version: 1,
      status: 'active',
    };
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'ACT Writing',
      kind: 'act_writing',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      description: null,
      archivedAt: null,
      organizationAssignments: [
        { organization: { id: 'org-1', name: 'Connell School' } },
      ],
      gradingAssistantLinks: [],
      assignmentModules: [],
      image: null,
    });
    prisma.teacherProfile.findMany.mockResolvedValue([
      {
        id: 'teacher-1',
        profile: {
          organizationId: 'org-1',
          organization: { name: 'Connell School' },
          user: { email: 'teacher@example.test', name: 'Test Teacher' },
        },
      },
    ]);
    prisma.featureAccessTarget.findMany.mockResolvedValue([
      { targetId: 'teacher-1', enabled: false },
    ]);
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([
      activeTemplate,
    ]);

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.gradingAssistantTemplate.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      orderBy: [{ name: 'asc' }],
    });
    expect((result as { data: any }).data.gradingAssistantTemplates).toEqual([
      activeTemplate,
    ]);
    expect((result as { data: any }).data.teacherAccessRows).toEqual([
      {
        teacherProfileId: 'teacher-1',
        teacherName: 'Test Teacher',
        teacherEmail: 'teacher@example.test',
        organizationName: 'Connell School',
        statusLabel: 'Teacher override: disabled',
        effectiveEnabled: false,
        overrideAccess: 'disabled',
      },
    ]);
  });
});
