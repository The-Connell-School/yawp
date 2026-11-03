import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    count: mock(),
    create: mock(),
    findUnique: mock(),
    findMany: mock(() => Promise.resolve([])),
  },
  rubric: {
    findUnique: mock(),
    findFirst: mock(),
    findMany: mock(() => Promise.resolve([])),
  },
  rubricRelease: {
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(),
  },
  user: {
    findFirst: mock(),
  },
};

const requireAdmin = mock();
const requireUserId = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin, requireUserId }));
mock.module('~/utils/platform-admin-actor.server', () => ({
  resolvePlatformAdminActorEmail: mock(async () => 'admin@test.local'),
}));

const { action } = await import('./route');

const platformAdminEditStamp = {
  _lastAdminEdit: {
    source: 'platform',
    updatedBy: 'admin@test.local',
    updatedAt: expect.any(String),
  },
};

describe('admin assignment type new action', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireUserId.mockReset();
    prisma.user.findFirst.mockReset();
    prisma.assignmentType.count.mockReset();
    prisma.assignmentType.create.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    prisma.rubric.findUnique.mockReset();
    prisma.rubric.findFirst.mockReset();
    prisma.rubricRelease.findUnique.mockReset();

    requireAdmin.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('admin-1');
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.assignmentType.count.mockResolvedValue(4);
    prisma.assignmentType.create.mockResolvedValue({ id: 'at-new' });
    prisma.rubric.findFirst.mockResolvedValue({
      id: 'rubric-daily-pages',
      name: 'daily-pages-engagement',
      schemaJson: {
        name: 'daily-pages-engagement',
        title: 'Daily Pages engagement',
        scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 100 },
        rubric: {
          categories: [
            {
              key: 'engagement_with_prompt',
              label: 'Engagement',
              description: 'Engagement',
              weight: 1,
            },
          ],
        },
        promptConfig: {},
        outputSchema: { schemaVersion: 1, responseShape: 'categories_overall_comment' },
        calibrationNotes: null,
      },
    });
  });

  test.each(['', '   '])('keeps the selected per-type override when the create textarea is %j', async (override) => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'source', archivedAt: null, rubricId: null,
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: { categories: [{ key: 'quality', label: 'Quality', description: 'Clear', weight: 1 }] },
      gradingPromptConfigJson: { systemInstructions: 'Source system', gradingInstructionsOverride: 'Source override' },
      gradingOutputSchemaJson: { schemaVersion: 1 },
    });
    const form = new FormData();
    form.set('title', 'Copied rubric');
    form.set('rubricId', 'assignment-type:source');
    form.set('gradingInstructionsOverride', override);
    const response = await action({ request: new Request('https://example.test/new', { method: 'POST', body: form }), params: {}, context: {} } as never);
    expect((response as Response).status).toBe(302);
    expect(prisma.assignmentType.create.mock.calls.at(-1)?.[0].data).toMatchObject({
      rubricId: null,
      gradingPromptConfigJson: { systemInstructions: 'Source system', gradingInstructionsOverride: 'Source override' },
    });
  });

  test('persists a selected library rubric and instructions without copying grading JSON', async () => {
    prisma.rubric.findFirst.mockResolvedValueOnce({
      id: 'daily-pages',
      name: 'daily-pages-engagement',
      schemaJson: {
        name: 'daily-pages-engagement',
        title: 'Daily Pages engagement',
        scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 100 },
        rubric: {
          categories: [
            {
              key: 'engagement_with_prompt',
              label: 'Engagement',
              description: 'Engagement',
              weight: 1,
            },
          ],
        },
        promptConfig: {},
        outputSchema: { schemaVersion: 1, responseShape: 'categories_overall_comment' },
        calibrationNotes: null,
      },
    });
    const form = new FormData();
    form.set('title', 'Daily journal');
    form.set('rubricId', 'daily-pages');
    form.set('gradingInstructionsOverride', '  Focus on reflection.  ');
    await action({ request: new Request('https://example.test/new', { method: 'POST', body: form }), params: {}, context: {} } as never);
    expect(prisma.rubric.findFirst).toHaveBeenCalled();
    expect(prisma.assignmentType.create).toHaveBeenCalledWith({ data: {
      title: 'Daily journal', kind: null, description: null, position: 4,
      rubricId: 'daily-pages', gradingPromptConfigJson: {
        gradingInstructionsOverride: 'Focus on reflection.',
        ...platformAdminEditStamp,
      },
    } });
  });

  test('rejects a deleted library selection inline without creating an assignment type', async () => {
    prisma.rubric.findFirst.mockResolvedValue(null);
    const form = new FormData();
    form.set('title', 'Daily journal');
    form.set('rubricId', 'deleted-rubric');
    const result = await action({ request: new Request('https://example.test/new', { method: 'POST', body: form }), params: {}, context: {} } as never);
    expect(result).toMatchObject({ data: { error: 'That rubric no longer exists. Choose another rubric.' }, init: { status: 400 } });
    expect(prisma.assignmentType.create).not.toHaveBeenCalled();
  });

  test('creates assignment type with rubric and grading config', async () => {
    const form = new FormData();
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
          },
        ],
      })
    );
    form.set(
      'promptConfigJson',
      JSON.stringify({ gradingInstructions: 'Grade this as ACT Writing.' })
    );

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/new',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: {},
      context: {} as never,
    } as never);

    expect(prisma.assignmentType.create).toHaveBeenCalledWith({
      data: {
        title: 'ACT Writing',
        kind: null,
        description: 'ACT writing assignment type',
        position: 4,
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
          ...platformAdminEditStamp,
        },
        gradingOutputSchemaJson: {
          schemaVersion: 1,
          responseShape: 'categories_overall_comment',
        },
      },
    });
    expect((response as Response).headers.get('Location')).toBe(
      '/app/admin/assignment-types/at-new'
    );
  });

  test('creates from the simplified UI without rewriting grading configuration', async () => {
    const form = new FormData();
    form.set('title', 'New assignment type');
    form.set('description', 'Choose its database rubric after saving.');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/new',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: {},
      context: {} as never,
    } as never);

    expect(prisma.assignmentType.create).toHaveBeenCalledWith({
      data: {
        title: 'New assignment type',
        kind: null,
        description: 'Choose its database rubric after saving.',
        position: 4,
      },
    });
  });

  test('creates an assignment type linked to a selected static library rubric', async () => {
    const form = new FormData();
    form.set('title', 'Daily reflection');
    form.set('rubricId', 'rubric-daily-pages');

    await action({
      request: new Request('https://example.test/app/admin/assignment-types/new', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {} as never,
    } as never);

    expect(prisma.rubric.findFirst).toHaveBeenCalled();
    expect(prisma.assignmentType.create).toHaveBeenCalledWith({
      data: {
        title: 'Daily reflection',
        kind: null,
        description: null,
        position: 4,
        rubricId: 'rubric-daily-pages',
      },
    });
  });

  test('blocks creating an assignment type whose rubric would silently fall back to the thesis default', async () => {
    const form = new FormData();
    form.set('title', 'New assignment type');
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'weighted_1_5', minScore: 1, maxScore: 5 })
    );
    form.set('rubricJson', JSON.stringify({ categories: [] }));
    form.set('promptConfigJson', JSON.stringify({ gradingInstructions: '' }));

    let result: unknown;
    try {
      result = await action({
        request: new Request(
          'https://example.test/app/admin/assignment-types/new',
          {
            method: 'POST',
            body: form,
          }
        ),
        params: {},
        context: {} as never,
      } as never);
    } catch (error) {
      throw error;
    }

    expect(result).toMatchObject({
      data: { error: expect.stringContaining('Every rubric category') },
      init: { status: 400 },
    });
    expect(prisma.assignmentType.create).not.toHaveBeenCalled();
  });

  test('blocks creating an assignment type with a partially-filled rubric category', async () => {
    const form = new FormData();
    form.set('title', 'New assignment type');
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'weighted_1_5', minScore: 1, maxScore: 5 })
    );
    form.set(
      'rubricJson',
      JSON.stringify({
        categories: [
          { key: 'claim', label: 'Claim', description: '', weight: 1 },
        ],
      })
    );
    form.set('promptConfigJson', JSON.stringify({ gradingInstructions: '' }));

    let result: unknown;
    try {
      result = await action({
        request: new Request(
          'https://example.test/app/admin/assignment-types/new',
          {
            method: 'POST',
            body: form,
          }
        ),
        params: {},
        context: {} as never,
      } as never);
    } catch (error) {
      throw error;
    }

    expect(result).toMatchObject({
      data: { error: expect.stringContaining('Every rubric category') },
      init: { status: 400 },
    });
    expect(prisma.assignmentType.create).not.toHaveBeenCalled();
  });
  test.each([
    ['missing title', { title: '   ' }, 'Title is required'],
    [
      'invalid JSON',
      { title: 'New type', rubricJson: '{invalid' },
      'rubricJson must be valid JSON',
    ],
  ])(
    'returns recoverable action data for %s',
    async (_name, fields, message) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.set(key, value);
      const result = await action({
        request: new Request(
          'https://example.test/app/admin/assignment-types/new',
          { method: 'POST', body: form }
        ),
        params: {},
        context: {} as never,
      } as never);
      expect(result).toMatchObject({
        data: { error: message },
        init: { status: 400 },
      });
      expect(prisma.assignmentType.create).not.toHaveBeenCalled();
    }
  );

  test('plain admin may persist legacy teacherNotesEnabled on create', async () => {
    const form = new FormData();
    form.set('title', 'Sneaky notes');
    form.set(
      'outputSchemaJson',
      JSON.stringify({ schemaVersion: 1, teacherNotesEnabled: true })
    );
    form.set(
      'rubricJson',
      JSON.stringify({
        categories: [
          {
            key: 'quality',
            label: 'Quality',
            description: 'Overall quality.',
            weight: 1,
          },
        ],
      })
    );
    form.set('scoringScale', JSON.stringify({ type: 'weighted_1_5', minScore: 1, maxScore: 5 }));
    await action({
      request: new Request('https://example.test/new', { method: 'POST', body: form }),
      params: {},
      context: {} as never,
    } as never);
    expect(prisma.assignmentType.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gradingOutputSchemaJson: {
          schemaVersion: 1,
          teacherNotesEnabled: true,
        },
      }),
    });
  });
});
