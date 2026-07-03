import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentTypeAiVersion: {
    aggregate: mock(),
    create: mock(),
  },
  assignmentType: {
    findUnique: mock(),
  },
  assignmentModule: {
    findFirst: mock(),
    update: mock(),
  },
  assignmentModuleInstruction: {
    count: mock(),
    create: mock(),
    update: mock(),
    delete: mock(),
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
    prisma.assignmentTypeAiVersion.aggregate.mockReset();
    prisma.assignmentTypeAiVersion.create.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    prisma.assignmentTypeAiVersion.aggregate.mockResolvedValue({
      _max: { versionNumber: null },
    });
    prisma.assignmentTypeAiVersion.create.mockResolvedValue({
      id: 'version-1',
    });
  });

  test('loads module without selecting rubricJson explicitly', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Essay',
      rubricJson: { categories: [] },
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

  test('returns 404 when module does not belong to assignment type', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Essay',
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
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentTypeAiVersion.aggregate.mockReset();
    prisma.assignmentTypeAiVersion.create.mockReset();
    prisma.assignmentModule.update.mockReset();
    prisma.assignmentModuleInstruction.count.mockReset();
    prisma.assignmentModuleInstruction.create.mockReset();
    prisma.assignmentModuleInstruction.update.mockReset();
    prisma.assignmentModuleInstruction.delete.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-user-1' });
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Essay',
      kind: 'thesis_driven_essay',
      description: null,
      scoringScaleJson: null,
      rubricJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'mod-1',
          title: 'Draft Thesis',
          position: 0,
          description: 'Work on the thesis.',
          tutorInstructions: 'Coach thesis revision.',
          isSelfGuided: true,
          rubricAlignmentJson: { thesis_and_content: 'primary' },
          instructions: [],
        },
      ],
    });
    prisma.assignmentTypeAiVersion.aggregate.mockResolvedValue({
      _max: { versionNumber: 4 },
    });
    prisma.assignmentTypeAiVersion.create.mockResolvedValue({
      id: 'version-5',
    });
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

  test('records an AI version snapshot after module tutor settings change', async () => {
    const form = new FormData();
    form.set('intent', 'updateModule');
    form.set('title', 'Draft Thesis');
    form.set('description', 'Work on the thesis.');
    form.set('isSelfGuided', 'on');
    form.set('tutorInstructions', 'Coach thesis revision.');
    form.set(
      'rubricAlignmentJson',
      JSON.stringify({ thesis_and_content: 'primary' })
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

    expect(prisma.assignmentTypeAiVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        versionNumber: 5,
        changeSource: 'admin.assignment-module.update',
        changeSummary: 'Updated tutor module settings',
        createdByUserId: 'admin-user-1',
        snapshotJson: expect.objectContaining({
          modules: expect.arrayContaining([
            expect.objectContaining({
              id: 'mod-1',
              tutorInstructions: 'Coach thesis revision.',
            }),
          ]),
        }),
      }),
    });
  });

  test('records an AI version snapshot after instruction tutor prompt change', async () => {
    const form = new FormData();
    form.set('intent', 'updateInstruction');
    form.set('instructionId', 'instruction-1');
    form.set('title', 'Revise thesis');
    form.set('prompt', 'Revise your thesis.');
    form.set('tutorInstructions', 'Ask one targeted thesis question.');
    form.set('showChatButton', 'on');
    form.set('showNextButton', 'on');
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

    expect(prisma.assignmentModuleInstruction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'instruction-1' },
      })
    );
    expect(prisma.assignmentTypeAiVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        changeSource: 'admin.assignment-module-instruction.update',
        changeSummary: 'Updated tutor instruction',
        createdByUserId: 'admin-user-1',
      }),
    });
  });
});
