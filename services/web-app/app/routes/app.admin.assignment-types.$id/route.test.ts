import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: {
    findUnique: mock(),
    update: mock(),
  },
  orgMembership: {
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
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/auth.server.js', () => ({
  requireAdmin,
  requireUserId,
  requireMembership,
}));

const { action: routeAction, loader: routeLoader } = await import('./route');
const action = routeAction as any;
const loader = routeLoader as any;

describe('admin assignment type detail action', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentType.update.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.orgMembership.findUnique.mockReset();
    prisma.gradingAssistantTemplate.findMany.mockReset();
    prisma.gradingAssistantTemplate.findUnique.mockReset();
    prisma.assignmentTypeGradingAssistant.create.mockReset();
    prisma.assignmentTypeGradingAssistant.updateMany.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireAdmin.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.assignmentType.findUnique.mockResolvedValue({ id: 'at-1' });
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.orgMembership.findUnique.mockResolvedValue({ id: 'teacher-1' });
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
      '/app/admin/assignments-grading'
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

  test('updates assignment-type-owned rubric and grading config', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'ACT Writing');
    form.set('kind', 'act_writing');
    form.set('description', 'ACT writing assignment type');
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'act_writing_2_12', minScore: 1, maxScore: 6 })
    );
    form.set(
      'rubricJson',
      JSON.stringify({
        categories: [
          {
            key: 'ideas_and_analysis',
            label: 'Ideas and Analysis',
            description: 'Generate productive ideas and analyze perspectives.',
            weight: 0.25,
          },
        ],
      })
    );
    form.set(
      'promptConfigJson',
      JSON.stringify({ gradingInstructions: 'Grade this as ACT Writing.' })
    );

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
      data: expect.objectContaining({
        title: 'ACT Writing',
        kind: 'act_writing',
        description: 'ACT writing assignment type',
        scoringScaleJson: {
          type: 'act_writing_2_12',
          minScore: 1,
          maxScore: 6,
        },
        rubricJson: {
          categories: [
            {
              key: 'ideas_and_analysis',
              label: 'Ideas and Analysis',
              description:
                'Generate productive ideas and analyze perspectives.',
              weight: 0.25,
            },
          ],
        },
        gradingPromptConfigJson: {
          gradingInstructions: 'Grade this as ACT Writing.',
        },
        gradingOutputSchemaJson: {
          schemaVersion: 1,
          responseShape: 'categories_overall_comment',
        },
        gradingAssistantVersion: { increment: 1 },
      }),
    });
  });

  test('loads assignment type details and active grading assistant templates', async () => {
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
    expect((result as { data: any }).data.course.title).toBe('ACT Writing');
  });
});
