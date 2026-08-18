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
  // The editor lists the shared rubric library and seeds the built-in
  // rubrics on first sight.
  rubric: {
    findMany: mock(() => Promise.resolve([])),
    create: mock(),
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
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireAdmin.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma)
    );
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      rubricJson: {
        categories: [
          {
            key: 'ideas_and_analysis',
            label: 'Ideas and Analysis',
            description: 'Generate productive ideas and analyze perspectives.',
            weight: 1,
          },
        ],
      },
    });
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.orgMembership.findUnique.mockResolvedValue({ id: 'teacher-1' });
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
      '/app/admin/assignments'
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

  test('updates assignment-type-owned rubric and grading config', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'ACT Writing');
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
            scoreLabels: [
              { value: 1, label: 'Needs work' },
              { value: 6, label: 'Exceptional' },
            ],
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
        description: 'ACT writing assignment type',
        scoringScaleJson: {
          type: 'act_writing_2_12',
          minScore: 1,
          maxScore: 6,
        },
        // Score labels are part of what this save must persist — not just
        // the fields already required for a "complete" category.
        rubricJson: {
          categories: [
            {
              key: 'ideas_and_analysis',
              label: 'Ideas and Analysis',
              description:
                'Generate productive ideas and analyze perspectives.',
              weight: 0.25,
              scoreLabels: [
                { value: 1, label: 'Needs work' },
                { value: 6, label: 'Exceptional' },
              ],
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

  test('updates basics without rewriting or versioning the production grading config', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'Renamed assignment type');
    form.set('description', 'Only the basics changed.');

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
      data: {
        title: 'Renamed assignment type',
        description: 'Only the basics changed.',
      },
    });
  });

  test('blocks saving an edit that would newly introduce a thesis-default fallback', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'ACT Writing');
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'act_writing_2_12', minScore: 1, maxScore: 6 })
    );
    form.set('rubricJson', JSON.stringify({ categories: [] }));
    form.set('promptConfigJson', JSON.stringify({ gradingInstructions: '' }));

    let thrown: unknown;
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
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(400);
    expect(prisma.assignmentType.update).not.toHaveBeenCalled();
  });

  test('grandfathers an assignment type that already falls back to the thesis default', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      rubricJson: { categories: [] },
    });

    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'Renamed title, rubric still unset');
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'weighted_1_5', minScore: 1, maxScore: 5 })
    );
    form.set('rubricJson', JSON.stringify({ categories: [] }));
    form.set('promptConfigJson', JSON.stringify({ gradingInstructions: '' }));

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

    expect(prisma.assignmentType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'at-1' },
        data: expect.objectContaining({
          title: 'Renamed title, rubric still unset',
        }),
      })
    );
  });

  test('loads assignment type details without external rubric links', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'ACT Writing',
      kind: 'act_writing',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      description: null,
      archivedAt: null,
      assignmentModules: [],
      image: null,
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect((result as { data: any }).data.course.title).toBe('ACT Writing');
  });
});
