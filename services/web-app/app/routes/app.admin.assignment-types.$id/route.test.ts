import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: {
    findUnique: mock(),
    update: mock(),
  },
  assignmentTypePromptVersion: {
    findMany: mock(),
  },
  orgMembership: {
    findMany: mock(),
    findUnique: mock(),
  },
  // The editor lists the shared rubric library and seeds the built-in
  // rubrics on first sight.
  rubric: {
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(),
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
    prisma.assignmentTypePromptVersion.findMany.mockReset();
    prisma.rubric.findUnique.mockReset();
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
      gradingPromptConfigJson: {
        instructionsPreset: 'legacy_thesis_driven_essay',
      },
    });
    prisma.assignmentTypePromptVersion.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.orgMembership.findUnique.mockResolvedValue({ id: 'teacher-1' });
  });

  test('keeps a deleted rubric selection error in the editor', async () => {
    prisma.rubric.findUnique.mockResolvedValue(null);
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'Keep my edits');
    form.set('rubricId', 'deleted');
    const response = await action({ request: new Request('https://example.test/edit', { method: 'POST', body: form }), params: { id: 'at-1' }, context: {} });
    expect(response).toMatchObject({ data: { error: 'That rubric no longer exists. Choose another rubric.' }, init: { status: 400 } });
    expect(prisma.assignmentType.update).not.toHaveBeenCalled();
  });

  test('clears a library relationship without changing the underlying grading configuration', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'Existing type');
    form.set('rubricId', '__none__');
    await action({ request: new Request('https://example.test/edit', { method: 'POST', body: form }), params: { id: 'at-1' }, context: {} });
    expect(prisma.assignmentType.update).toHaveBeenCalledWith({ where: { id: 'at-1' }, data: { title: 'Existing type', description: null, rubricId: null } });
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
      JSON.stringify({
        systemInstructions: 'Act as an ACT Writing evaluator.',
        gradingInstructions: 'Grade this as ACT Writing.',
      })
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
          systemInstructions: 'Act as an ACT Writing evaluator.',
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

  test('persists the assignment-level General Tutor Instructions', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'AP History Essay');
    form.set('tutorInstructions', 'WHO YOU ARE. You are the YAWP! Tutor...');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: expect.objectContaining({
        tutorInstructions: 'WHO YOU ARE. You are the YAWP! Tutor...',
      }),
    });
  });

  test('a submission without the tutorInstructions field leaves it untouched', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'AP History Essay');

    await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1',
        { method: 'POST', body: form }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const updateData = prisma.assignmentType.update.mock.calls[0][0].data;
    expect('tutorInstructions' in updateData).toBe(false);
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

  test('saves a selected shared rubric with the assignment type update', async () => {
    prisma.rubric.findUnique.mockResolvedValue({ id: 'rubric-1' });

    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'Cristo Rey Essay');
    form.set('rubricId', 'rubric-1');

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

    expect(prisma.rubric.findUnique).toHaveBeenCalledWith({
      where: { id: 'rubric-1' },
      select: { id: true },
    });
    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: {
        title: 'Cristo Rey Essay',
        description: null,
        rubricId: 'rubric-1',
      },
    });
  });

  test('does not version an unchanged grading instruction override', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'Renamed assignment type');
    form.set('description', 'Only the basics changed.');
    form.set('gradingInstructionsOverride', '');

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

  test('saves grading assistant instructions without rewriting the rubric', async () => {
    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'ACT Writing');
    form.set('description', 'ACT writing assignment type');
    form.set(
      'gradingInstructionsOverride',
      'Apply the rubric with extra emphasis on concrete supporting details.'
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
      data: {
        title: 'ACT Writing',
        description: 'ACT writing assignment type',
        gradingPromptConfigJson: {
          instructionsPreset: 'legacy_thesis_driven_essay',
          gradingInstructionsOverride:
            'Apply the rubric with extra emphasis on concrete supporting details.',
        },
        gradingAssistantVersion: { increment: 1 },
      },
    });
  });

  test('clears only the grading assistant instruction override', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      rubricJson: { categories: [] },
      gradingPromptConfigJson: {
        instructionsPreset: 'legacy_thesis_driven_essay',
        gradingInstructionsOverride: 'Use the temporary custom instructions.',
      },
    });

    const form = new FormData();
    form.set('intent', 'updateCourse');
    form.set('title', 'Thesis-Driven Essay');
    form.set('gradingInstructionsOverride', '   ');

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
        title: 'Thesis-Driven Essay',
        description: null,
        gradingPromptConfigJson: {
          instructionsPreset: 'legacy_thesis_driven_essay',
        },
        gradingAssistantVersion: { increment: 1 },
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
            weight: 1,
            description: 'Develop a clear perspective.',
          },
        ],
      },
      gradingPromptConfigJson: {
        systemInstructions: 'Act as an ACT Writing evaluator.',
        gradingInstructions: 'Apply the ACT Writing rubric exactly.',
      },
      gradingOutputSchemaJson: { schemaVersion: 1 },
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 4,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      evaluations: [
        {
          id: 'evaluation-1',
          title: 'Positive greeting',
          description: 'Begin with a brief, encouraging acknowledgment.',
          position: 0,
          archivedAt: null,
          createdAt: new Date('2026-07-13T16:00:00.000Z'),
        },
      ],
      evaluationCases: [
        {
          id: 'case-1',
          evaluationId: 'evaluation-1',
          title: 'Clear claim',
          rubricCategoryKey: 'ideas_and_analysis',
          documentText: 'School uniforms should remain optional.',
          criterion: 'The feedback identifies the claim.',
          expectedOutputJson: {
            overallComment: 'Jordan, you have a clear claim. Revise next.',
          },
          position: 0,
          createdAt: new Date('2026-07-13T17:00:00.000Z'),
        },
      ],
      evaluationRuns: [
        {
          id: 'run-1',
          promptVersion: 4,
          status: 'completed',
          totalCases: 1,
          passedCases: 1,
          failedCases: 0,
          needsReviewCases: 0,
          promptSnapshotJson: {
            compiledPrompt: {
              system: 'You are a grading assistant. Prompt v4.',
              userMessage: 'Grade the case document.',
            },
          },
          createdAt: new Date('2026-07-13T18:00:00.000Z'),
          completedAt: new Date('2026-07-13T18:00:05.000Z'),
          results: [
            {
              id: 'result-1',
              caseId: 'case-1',
              caseTitle: 'Clear claim',
              rubricCategoryKey: 'ideas_and_analysis',
              criterion: 'The feedback identifies the claim.',
              status: 'pass',
              evidence: 'The response identifies the claim.',
              gradingOutputJson: { overallComment: 'Jordan, revise next.' },
              expectedOutputJson: {
                overallComment: 'Jordan, you have a clear claim. Revise next.',
              },
            },
          ],
        },
      ],
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

    const data = (result as { data: any }).data;
    expect(data.course.title).toBe('ACT Writing');
    expect(data.gradingAssistantPromptPreview.version).toBe(4);
    expect(data.gradingAssistantPromptPreview.system).toContain(
      'You are a grading assistant.'
    );
    expect(data.gradingAssistantPromptPreview.system).toContain(
      'Assignment type system instructions:\nAct as an ACT Writing evaluator.'
    );
    expect(data.gradingAssistantPromptPreview.userMessage).toContain(
      'Assignment type grading config: ACT Writing'
    );
    expect(data.gradingAssistantPromptPreview.userMessage).toContain(
      'Apply the ACT Writing rubric exactly.'
    );
    expect(data.gradingAssistantPromptPreview.userMessage).toContain(
      'Essay:\n[CASE DOCUMENT CONTENT]'
    );
    expect(data.gradingAssistantPromptPreview.previewInputs).toEqual({
      studentFirstName: 'Jordan',
      strictnessLevel: 'intermediate',
      documentText: '[CASE DOCUMENT CONTENT]',
    });
    expect(data.evaluationHistory).toBeUndefined();
    const assignmentTypeQuery =
      prisma.assignmentType.findUnique.mock.calls[0]?.[0];
    expect(assignmentTypeQuery.include.evaluations).toBeUndefined();
    expect(assignmentTypeQuery.include.evaluationCases).toBeUndefined();
    expect(assignmentTypeQuery.include.evaluationRuns).toBeUndefined();
  });

  test('resolves the production prompt version label for the current prompt', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'ACT Writing',
      kind: 'act_writing',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      description: null,
      archivedAt: null,
      scoringScaleJson: null,
      rubricJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      evaluations: [],
      evaluationCases: [],
      assignmentModules: [],
      image: null,
    });
    prisma.assignmentTypePromptVersion.findMany.mockResolvedValue([
      {
        id: 'prompt-a',
        createdAt: new Date('2026-07-14T14:00:00.000Z'),
        status: 'previous',
      },
      {
        id: 'prompt-b',
        createdAt: new Date('2026-07-14T16:00:00.000Z'),
        status: 'production',
      },
    ]);

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(data.currentPromptLabel).toBe('7.14.2026 B');
  });

  test('does not present the standard prompt as the exact AP History invocation', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-ap-history',
      title: 'AP History Essay',
      kind: 'ap_history',
      systemKey: 'ap_history_essay',
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      description: null,
      archivedAt: null,
      scoringScaleJson: null,
      rubricJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [],
      image: null,
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-ap-history'
      ),
      params: { id: 'at-ap-history' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(data.gradingAssistantPromptPreview).toBeNull();
    expect(data.gradingAssistantPromptPreviewUnavailableReason).toContain(
      'assignment snapshot'
    );
    expect(prisma.assignmentType.findUnique).toHaveBeenCalledTimes(1);
  });
});
