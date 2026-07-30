import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
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
    prisma.assignmentType.count.mockReset();
    prisma.assignmentType.create.mockReset();

    requireAdmin.mockResolvedValue(undefined);
    prisma.assignmentType.count.mockResolvedValue(4);
    prisma.assignmentType.create.mockResolvedValue({ id: 'at-new' });
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
      request: new Request('https://example.test/app/admin/assignment-types/new', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {} as never,
    } as never);

    expect(prisma.assignmentType.create).toHaveBeenCalledWith({
      data: {
        title: 'ACT Writing',
        kind: null,
        description: 'ACT writing assignment type',
        tutorInstructions: null,
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
});
