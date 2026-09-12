import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
    findMany: mock(),
  },
  assignmentTypePromptVersion: {
    findMany: mock(),
    findFirst: mock(),
    create: mock(),
  },
  assignmentTypeEvaluationSuiteVersion: {
    findMany: mock(),
    findFirst: mock(),
    create: mock(),
  },
  assignmentTypeEvaluationRun: {
    findMany: mock(),
  },
};

const requireAdmin = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/auth.server.js', () => ({ requireAdmin }));

const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

const baseAssignmentType = {
  id: 'at-1',
  title: 'Thesis-driven essay',
  kind: 'essay',
  scoringScaleJson: {
    type: 'weighted_1_5',
    minScore: 1,
    maxScore: 5,
  },
  rubricJson: {
    categories: [
      {
        key: 'thesis_and_content',
        label: 'Thesis/Content',
        weight: 40,
        description: 'Clear thesis.',
      },
    ],
  },
  gradingPromptConfigJson: {
    gradingInstructions: 'Apply the rubric fairly.',
  },
  gradingOutputSchemaJson: {},
  gradingCalibrationNotes: null,
  gradingAssistantVersion: 1,
  gradingAssistantSourceTemplateId: null,
  gradingAssistantSourceTemplateSlug: null,
};

describe('admin assignment type prompt loader', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.assignmentTypePromptVersion.findMany.mockReset();
    prisma.assignmentTypePromptVersion.findFirst.mockReset();
    prisma.assignmentTypePromptVersion.create.mockReset();
    prisma.assignmentTypeEvaluationSuiteVersion.findMany.mockReset();
    prisma.assignmentTypeEvaluationSuiteVersion.findFirst.mockReset();
    prisma.assignmentTypeEvaluationSuiteVersion.create.mockReset();
    prisma.assignmentTypeEvaluationRun.findMany.mockReset();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(undefined);

    prisma.assignmentType.findMany.mockResolvedValue([]);
    prisma.assignmentTypePromptVersion.findMany.mockResolvedValue([
      {
        id: 'prompt-1',
        version: 1,
        revision: 1,
        status: 'production',
        systemMessageTemplate: 'System {{assignment_type}}',
        userMessageTemplate: 'Grade {{document}}',
        variableSchemaJson: {},
        contentHash: 'hash-1',
        createdAt: new Date('2026-07-13T12:00:00.000Z'),
        updatedAt: new Date('2026-07-13T12:00:00.000Z'),
        promotedAt: new Date('2026-07-13T12:00:00.000Z'),
      },
    ]);
    prisma.assignmentTypePromptVersion.findFirst.mockResolvedValue({
      id: 'prompt-1',
      version: 1,
      revision: 1,
      status: 'production',
    });
    prisma.assignmentTypeEvaluationSuiteVersion.findMany.mockResolvedValue([]);
    prisma.assignmentTypeEvaluationSuiteVersion.findFirst.mockResolvedValue(null);
    prisma.assignmentTypeEvaluationSuiteVersion.create.mockResolvedValue({
      id: 'suite-1',
      version: 1,
      contentHash: 'suite-hash',
      snapshotJson: { evaluations: [], legacyCases: [] },
      createdAt: new Date('2026-07-13T12:00:00.000Z'),
    });
    prisma.assignmentTypeEvaluationRun.findMany.mockResolvedValue([]);
  });

  test('opens prompt tools with the selected library rubric and no inline grading JSON', async () => {
    const { STARTER_RUBRICS, DAILY_PAGES_RUBRIC_NAME } = await import('~/domain/rubrics/starter-rubrics');
    const schema = STARTER_RUBRICS.find(row => row.name === DAILY_PAGES_RUBRIC_NAME)!;
    prisma.assignmentType.findUnique.mockResolvedValue({
      ...baseAssignmentType, kind: null, rubricJson: null, scoringScaleJson: null,
      gradingPromptConfigJson: { gradingInstructionsOverride: 'Reward reflection.' },
      rubric: { name: schema.name, schemaJson: schema }, evaluations: [], evaluationCases: [],
    });
    const result = await loader({ request: new Request('https://example.test/prompt'), params: { id: 'at-1' }, context: {} });
    const workspace = result.data.promptWorkspace;
    expect(workspace).not.toBeNull();
    expect(workspace.scoringScale).toMatchObject({ minScore: 0, maxScore: 30, step: 10 });
    expect(workspace.rubric.categories.map((row: any) => row.key)).toEqual(['engagement_with_prompt']);
    expect(workspace.promptConfig.gradingInstructions).toBe('Reward reflection.');
    expect(workspace.compiledPreviewsByPromptId['prompt-1']).toBeDefined();
  });

  test('loads the assignment context and serialized evaluation history', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      ...baseAssignmentType,
      evaluations: [
        {
          id: 'evaluation-1',
          title: 'Positive greeting',
          description: 'Begin with an encouraging acknowledgment.',
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
          rubricCategoryKey: 'thesis_and_content',
          documentText: 'School uniforms should remain optional.',
          criterion: 'The feedback identifies the claim.',
          expectedOutputJson: { overallComment: 'Jordan, strong start.' },
          position: 0,
          archivedAt: null,
          createdAt: new Date('2026-07-13T17:00:00.000Z'),
        },
      ],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/prompt'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(data.assignmentType).toEqual({
      id: 'at-1',
      title: 'Thesis-driven essay',
    });
    expect(data.evaluationHistory.evaluations).toEqual([
      expect.objectContaining({
        id: 'evaluation-1',
        title: 'Positive greeting',
        archived: false,
      }),
    ]);
    expect(data.evaluationHistory.cases).toEqual([
      expect.objectContaining({
        id: 'case-1',
        evaluationId: 'evaluation-1',
        expectedOutput: { overallComment: 'Jordan, strong start.' },
      }),
    ]);
    expect(data.promptWorkspace).toEqual(
      expect.objectContaining({
        scoringScale: expect.objectContaining({ minScore: 1, maxScore: 5 }),
        rubric: expect.objectContaining({
          categories: expect.arrayContaining([
            expect.objectContaining({ key: 'thesis_and_content' }),
          ]),
        }),
        compiledPreviewsByPromptId: expect.objectContaining({
          'prompt-1': expect.objectContaining({
            system: expect.any(String),
            userMessage: expect.any(String),
            version: 1,
          }),
        }),
      })
    );
  });

  test('returns not found when the assignment type does not exist', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue(null);

    await expect(
      loader({
        request: new Request(
          'https://example.test/app/admin/assignment-types/missing/prompt'
        ),
        params: { id: 'missing' },
        context: {} as never,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});
