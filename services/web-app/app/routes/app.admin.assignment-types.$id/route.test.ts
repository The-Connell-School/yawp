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
    prisma.assignmentType.findUnique.mockResolvedValue({ id: 'at-1' });
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
      evaluationCases: [
        {
          id: 'case-1',
          title: 'Clear claim',
          rubricCategoryKey: 'ideas_and_analysis',
          documentText: 'School uniforms should remain optional.',
          criterion: 'The feedback identifies the claim.',
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
    expect(data.evaluationHistory.cases).toEqual([
      expect.objectContaining({
        id: 'case-1',
        rubricCategoryKey: 'ideas_and_analysis',
      }),
    ]);
    expect(data.evaluationHistory.runs).toEqual([
      expect.objectContaining({
        id: 'run-1',
        promptVersion: 4,
        passedCases: 1,
        promptSnapshot: {
          compiledPrompt: {
            system: 'You are a grading assistant. Prompt v4.',
            userMessage: 'Grade the case document.',
          },
        },
        results: [
          expect.objectContaining({
            caseId: 'case-1',
            criterion: 'The feedback identifies the claim.',
            status: 'pass',
          }),
        ],
      }),
    ]);
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
