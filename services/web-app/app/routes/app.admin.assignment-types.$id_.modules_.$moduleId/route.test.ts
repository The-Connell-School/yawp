import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentModule: {
    update: mock(),
  },
};

const requireAdmin = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));

const { action } = await import('./route');

describe('admin assignment module action', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    prisma.assignmentModule.update.mockReset();

    requireAdmin.mockResolvedValue(undefined);
  });

  test('updates module-level rubric relationships', async () => {
    const form = new FormData();
    form.set('intent', 'updateModule');
    form.set('title', 'Draft Thesis');
    form.set('description', 'Work on the thesis.');
    form.set('isSelfGuided', 'on');
    form.set('tutorInstructions', 'Coach thesis revision.');
    form.set(
      'rubricAlignmentJson',
      JSON.stringify({
        thesis_and_content: 'primary',
        organization_and_structure: 'supporting',
        grammar_and_mechanics: 'not-applicable',
      })
    );

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/modules/mod-1',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1', moduleId: 'mod-1' },
      context: {} as never,
    } as never);

    expect(prisma.assignmentModule.update).toHaveBeenCalledWith({
      where: { id: 'mod-1' },
      data: {
        title: 'Draft Thesis',
        description: 'Work on the thesis.',
        isSelfGuided: true,
        tutorInstructions: 'Coach thesis revision.',
        rubricAlignmentJson: {
          thesis_and_content: 'primary',
          organization_and_structure: 'supporting',
          grammar_and_mechanics: 'not-applicable',
        },
      },
    });
  });
});
