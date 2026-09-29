import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
  },
  assignmentModule: {
    findFirst: mock(),
    update: mock(),
  },
};

const requireAdmin = mock();
const requireMutableRequest = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));

const { action, loader } = await import('./route');

describe('admin assignment module loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentModule.findFirst.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('loads module with the assignment type rubric relation', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Essay',
      rubricJson: { categories: [] },
      rubric: null,
    });
    prisma.assignmentModule.findFirst.mockResolvedValue({
      id: 'mod-1',
      title: 'Draft',
      isSelfGuided: false,
      description: null,
      tutorInstructions: null,
      position: 0,
      rubricAlignmentJson: null,
      instructions: [],
    });

    const response = (await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/modules/mod-1'
      ),
      params: { id: 'at-1', moduleId: 'mod-1' },
      context: {} as never,
    } as never)) as { data: { course: { id: string }; module: { id: string } } };

    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      include: { rubric: { select: { schemaJson: true } } },
    });
    expect(prisma.assignmentModule.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'mod-1',
        assignmentTypeId: 'at-1',
        deletedAt: null,
      },
      include: {
        instructions: {
          orderBy: { position: 'asc' },
          include: {
            buttons: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });
    expect(response.data.course.id).toBe('at-1');
    expect(response.data.module.id).toBe('mod-1');
  });

  test('uses the selected library rubric for module relationships', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Essay',
      rubricJson: {
        categories: [
          {
            key: 'legacy',
            label: 'Legacy',
            description: 'Legacy category.',
            weight: 1,
          },
        ],
      },
      rubric: {
        schemaJson: {
          name: 'portable-rubric',
          title: 'Portable rubric',
          rubric: {
            categories: [
              {
                key: 'library_category',
                label: 'Library category',
                description: 'Selected from the shared library.',
                weight: 1,
              },
            ],
          },
        },
      },
    });
    prisma.assignmentModule.findFirst.mockResolvedValue({
      id: 'mod-1',
      title: 'Draft',
      isSelfGuided: false,
      description: null,
      tutorInstructions: null,
      position: 0,
      rubricAlignmentJson: null,
      instructions: [],
    });

    const response = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/modules/mod-1'
      ),
      params: { id: 'at-1', moduleId: 'mod-1' },
      context: {} as never,
    } as never);

    expect(response.data.course.rubricJson).toEqual({
      categories: [expect.objectContaining({ key: 'library_category' })],
    });
  });

  test('returns 404 when module does not belong to assignment type', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Essay',
      rubric: null,
    });
    prisma.assignmentModule.findFirst.mockResolvedValue(null);

    await expect(
      loader({
        request: new Request(
          'https://example.test/app/admin/assignment-types/at-1/modules/mod-1'
        ),
        params: { id: 'at-1', moduleId: 'mod-1' },
        context: {} as never,
      } as never)
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('admin assignment module action', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireMutableRequest.mockReset();
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

  test('writes per-variant tutor instructions when the form carries them', async () => {
    const form = new FormData();
    form.set('intent', 'updateModule');
    form.set('title', 'Pre-Writing');
    form.set('tutorInstructionsVariantKeys', 'dbq,leq');
    form.set('tutorInstructionsVariant.dbq', 'DBQ section guidance.');
    form.set('tutorInstructionsVariant.leq', 'LEQ section guidance.');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/modules/mod-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1', moduleId: 'mod-1' },
      context: {} as never,
    } as never);

    const updateData = prisma.assignmentModule.update.mock.calls[0][0].data;
    expect(updateData.tutorInstructionsVariantsJson).toEqual({
      dbq: 'DBQ section guidance.',
      leq: 'LEQ section guidance.',
    });
  });

  test('a cleared variant box is dropped so the authored default returns', async () => {
    const form = new FormData();
    form.set('intent', 'updateModule');
    form.set('title', 'Pre-Writing');
    form.set('tutorInstructionsVariantKeys', 'dbq,leq');
    form.set('tutorInstructionsVariant.dbq', 'Edited DBQ guidance.');
    form.set('tutorInstructionsVariant.leq', '   ');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/modules/mod-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1', moduleId: 'mod-1' },
      context: {} as never,
    } as never);

    const updateData = prisma.assignmentModule.update.mock.calls[0][0].data;
    expect(updateData.tutorInstructionsVariantsJson).toEqual({
      dbq: 'Edited DBQ guidance.',
    });
  });

  test('a form without variant fields leaves the stored variants untouched', async () => {
    // Non-variant assignment types never render the variant editor; their
    // submissions must not blank a column they do not know about.
    const form = new FormData();
    form.set('intent', 'updateModule');
    form.set('title', 'Draft Thesis');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/modules/mod-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1', moduleId: 'mod-1' },
      context: {} as never,
    } as never);

    const updateData = prisma.assignmentModule.update.mock.calls[0][0].data;
    expect('tutorInstructionsVariantsJson' in updateData).toBe(false);
  });
});
