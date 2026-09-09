import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  rubric: { findUnique: mock() },
  assignmentType: {
    count: mock(),
    create: mock(),
  },
};

const requireAdmin = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));

const { action } = await import('./route');

describe('admin assignment type new action', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    prisma.rubric.findUnique.mockReset();
    prisma.rubric.findUnique.mockResolvedValue({ id: "daily-pages" });
    prisma.assignmentType.count.mockReset();
    prisma.assignmentType.create.mockReset();

    requireAdmin.mockResolvedValue(undefined);
    prisma.assignmentType.count.mockResolvedValue(4);
    prisma.assignmentType.create.mockResolvedValue({ id: 'at-new' });
  });

  test('persists a selected library rubric and instructions without copying grading JSON', async () => {
    const form = new FormData();
    form.set('title', 'Daily journal');
    form.set('rubricId', 'daily-pages');
    form.set('gradingInstructionsOverride', '  Focus on reflection.  ');
    await action({ request: new Request('https://example.test/new', { method: 'POST', body: form }), params: {}, context: {} } as never);
    expect(prisma.rubric.findUnique).toHaveBeenCalledWith({ where: { id: 'daily-pages' }, select: { id: true } });
    expect(prisma.assignmentType.create).toHaveBeenCalledWith({ data: {
      title: 'Daily journal', kind: null, description: null, position: 4,
      rubricId: 'daily-pages', gradingPromptConfigJson: { gradingInstructionsOverride: 'Focus on reflection.' },
    } });
  });

  test('rejects a deleted library selection inline without creating an assignment type', async () => {
    prisma.rubric.findUnique.mockResolvedValue(null);
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
});
