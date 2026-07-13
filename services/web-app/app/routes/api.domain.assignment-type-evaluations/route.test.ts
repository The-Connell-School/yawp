import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: { findUnique: mock() },
  assignmentTypeEvaluation: {
    count: mock(),
    create: mock(),
    updateMany: mock(),
  },
  assignmentTypeEvaluationCase: {
    count: mock(),
    create: mock(),
    updateMany: mock(),
  },
  assignmentTypeEvaluationRun: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
  assignmentTypeEvaluationResult: { createMany: mock() },
};
const requireAdmin = mock();
const getLLMCompletion = mock();
const runAssignmentTypeEvaluationSuite = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));
mock.module(
  '~/domain/ai-evaluation/assignment-type-evaluation-suite.server',
  () => ({ runAssignmentTypeEvaluationSuite })
);

const { action } = await import('./route');

const assignmentType = {
  id: 'at-1',
  title: 'Argument Essay',
  kind: null,
  systemKey: null,
  scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
  rubricJson: {
    categories: [
      {
        key: 'claim',
        label: 'Claim',
        weight: 1,
        description: 'States a defensible position.',
      },
    ],
  },
  gradingPromptConfigJson: {
    systemInstructions: 'Act as a careful evaluator.',
    gradingInstructions: 'Apply the assignment rubric.',
  },
  gradingOutputSchemaJson: { schemaVersion: 1 },
  gradingCalibrationNotes: null,
  gradingAssistantVersion: 7,
  gradingAssistantSourceTemplateId: null,
  gradingAssistantSourceTemplateSlug: null,
  evaluationCases: [
    {
      id: 'case-1',
      evaluationId: 'evaluation-1',
      title: 'Clear claim',
      rubricCategoryKey: 'claim',
      documentText: 'Uniforms should remain optional.',
      criterion: 'The feedback identifies the claim.',
      expectedOutputJson: {
        categories: [{ key: 'claim', score: 4, comment: 'Clear claim.' }],
        overallComment: 'Jordan, explain the stakes next.',
      },
    },
  ],
};

function requestWith(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return new Request(
    'https://example.test/api/domain/assignment-type-evaluations',
    { method: 'POST', body: formData }
  );
}

describe('assignment-type evaluations action', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      if (typeof model === 'function') {
        model.mockReset();
        continue;
      }
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireAdmin.mockReset();
    getLLMCompletion.mockReset();
    runAssignmentTypeEvaluationSuite.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma)
    );
    prisma.assignmentType.findUnique.mockResolvedValue(assignmentType);
    prisma.assignmentTypeEvaluationRun.findFirst.mockResolvedValue(null);
    prisma.assignmentTypeEvaluation.count.mockResolvedValue(1);
    prisma.assignmentTypeEvaluation.create.mockResolvedValue({
      id: 'evaluation-new',
    });
    prisma.assignmentTypeEvaluationCase.count.mockResolvedValue(2);
    prisma.assignmentTypeEvaluationCase.create.mockResolvedValue({
      id: 'case-new',
    });
    prisma.assignmentTypeEvaluationCase.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.assignmentTypeEvaluationRun.create.mockResolvedValue({
      id: 'run-1',
    });
    prisma.assignmentTypeEvaluationRun.update.mockResolvedValue({
      id: 'run-1',
    });
    prisma.assignmentTypeEvaluationResult.createMany.mockResolvedValue({
      count: 1,
    });
    runAssignmentTypeEvaluationSuite.mockResolvedValue({
      summary: { total: 1, passed: 1, failed: 0, needsReview: 0 },
      results: [
        {
          caseId: 'case-1',
          caseTitle: 'Clear claim',
          rubricCategoryKey: 'claim',
          criterion: 'The feedback identifies the claim.',
          status: 'pass',
          evidence: 'The response identifies the claim.',
          gradingOutput: {
            categories: [{ key: 'claim', score: 4, comment: 'Clear claim.' }],
            overallComment: 'Jordan, explain the stakes next.',
          },
          responseContract: {
            status: 'pass',
            evidence: 'Output matches the grading response contract.',
          },
        },
      ],
    });
  });

  test('generates editable input and full-output cases for one named evaluation', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        evaluationTitle: 'Positive greeting',
        cases: [
          {
            title: 'Strong opening',
            documentText:
              'School uniforms can reduce distractions while still allowing students to express themselves through clubs and activities.',
            expectedOutput: {
              categories: [
                { key: 'claim', score: 4, comment: 'The claim is clear.' },
              ],
              overallComment:
                'Jordan, you have a clear position. Explain why the tradeoff matters.',
            },
          },
        ],
      })
    );

    const response = await action({
      request: requestWith({
        intent: 'generateEvaluation',
        assignmentTypeId: 'at-1',
        description:
          'Always begin the final feedback with a brief, positive greeting.',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(getLLMCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          feature: 'grading-evaluation-case-generation',
          assignmentTypeId: 'at-1',
        }),
      })
    );
    expect((response as { data: any }).data).toMatchObject({
      success: true,
      evaluation: {
        title: 'Positive greeting',
        cases: [
          expect.objectContaining({
            title: 'Strong opening',
            expectedOutput: expect.objectContaining({
              overallComment: expect.stringContaining('Jordan'),
            }),
          }),
        ],
      },
    });
  });

  test('saves selected generated cases under one evaluation column', async () => {
    const cases = [
      {
        title: 'Strong opening',
        documentText:
          'School uniforms can reduce distractions while still allowing students to express themselves through clubs and activities.',
        expectedOutput: {
          categories: [
            { key: 'claim', score: 4, comment: 'The claim is clear.' },
          ],
          overallComment:
            'Jordan, you have a clear position. Explain why the tradeoff matters.',
        },
      },
      {
        title: 'Missing opening',
        documentText:
          'There are many different opinions about school uniforms, and each school approaches the issue in a different way.',
        expectedOutput: {
          categories: [
            { key: 'claim', score: 2, comment: 'No clear claim is present.' },
          ],
          overallComment:
            'Jordan, you introduce the topic clearly. Add a specific position to guide the essay.',
        },
      },
    ];

    const response = await action({
      request: requestWith({
        intent: 'createEvaluation',
        assignmentTypeId: 'at-1',
        title: 'Positive greeting',
        description:
          'Always begin the final feedback with a brief, positive greeting.',
        casesJson: JSON.stringify(cases),
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypeEvaluation.create).toHaveBeenCalledWith({
      data: {
        assignmentTypeId: 'at-1',
        title: 'Positive greeting',
        description:
          'Always begin the final feedback with a brief, positive greeting.',
        position: 1,
        cases: {
          create: cases.map((evaluationCase, position) => ({
            assignmentTypeId: 'at-1',
            title: evaluationCase.title,
            documentText: evaluationCase.documentText,
            expectedOutputJson: evaluationCase.expectedOutput,
            criterion:
              'Always begin the final feedback with a brief, positive greeting.',
            rubricCategoryKey: 'claim',
            position,
          })),
        },
      },
    });
    expect((response as { data: any }).data).toEqual({
      success: true,
      evaluationId: 'evaluation-new',
    });
  });

  test('adds a case under one assignment-type rubric category', async () => {
    const response = await action({
      request: requestWith({
        intent: 'createCase',
        assignmentTypeId: 'at-1',
        rubricCategoryKey: 'claim',
        title: 'Clear claim',
        documentText: 'Uniforms should remain optional.',
        criterion: 'The feedback identifies the claim.',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(prisma.assignmentTypeEvaluationCase.create).toHaveBeenCalledWith({
      data: {
        assignmentTypeId: 'at-1',
        rubricCategoryKey: 'claim',
        title: 'Clear claim',
        documentText: 'Uniforms should remain optional.',
        criterion: 'The feedback identifies the claim.',
        position: 2,
      },
    });
    expect((response as { data: any }).data).toMatchObject({ success: true });
  });

  test('rejects a case category that is not in the assignment rubric', async () => {
    const response = await action({
      request: requestWith({
        intent: 'createCase',
        assignmentTypeId: 'at-1',
        rubricCategoryKey: 'made_up_category',
        title: 'Unknown case',
        documentText: 'A document.',
        criterion: 'A criterion.',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect((response as { init: { status: number } }).init.status).toBe(400);
    expect(prisma.assignmentTypeEvaluationCase.create).not.toHaveBeenCalled();
  });

  test('archives a case without deleting its historical results', async () => {
    const response = await action({
      request: requestWith({
        intent: 'archiveCase',
        assignmentTypeId: 'at-1',
        caseId: 'case-1',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypeEvaluationCase.updateMany).toHaveBeenCalledWith(
      {
        where: {
          id: 'case-1',
          assignmentTypeId: 'at-1',
          archivedAt: null,
        },
        data: { archivedAt: expect.any(Date) },
      }
    );
    expect((response as { data: any }).data).toEqual({ success: true });
  });

  test('does not create an empty history run', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      ...assignmentType,
      evaluationCases: [],
    });

    const response = await action({
      request: requestWith({ intent: 'runSuite', assignmentTypeId: 'at-1' }),
      params: {},
      context: {} as never,
    } as any);

    expect((response as { init: { status: number } }).init.status).toBe(400);
    expect(prisma.assignmentTypeEvaluationRun.create).not.toHaveBeenCalled();
  });

  test('rejects a second suite run while one is already running', async () => {
    prisma.assignmentTypeEvaluationRun.findFirst.mockResolvedValue({
      id: 'run-in-progress',
    });

    const response = await action({
      request: requestWith({ intent: 'runSuite', assignmentTypeId: 'at-1' }),
      params: {},
      context: {} as never,
    } as any);

    expect((response as { init: { status: number } }).init.status).toBe(409);
    expect((response as { data: any }).data.message).toBe(
      'An evaluation suite run is already in progress.'
    );
    expect(prisma.assignmentTypeEvaluationRun.create).not.toHaveBeenCalled();
  });

  test('runs all active cases and persists one immutable prompt-version row', async () => {
    const response = await action({
      request: requestWith({ intent: 'runSuite', assignmentTypeId: 'at-1' }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypeEvaluationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        promptVersion: 7,
        status: 'running',
        totalCases: 1,
        promptSnapshotJson: expect.objectContaining({
          compiledPrompt: expect.objectContaining({
            system: expect.stringContaining('You are a grading assistant.'),
          }),
        }),
      }),
    });
    expect(runAssignmentTypeEvaluationSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationCases: assignmentType.evaluationCases,
      })
    );
    expect(
      prisma.assignmentTypeEvaluationResult.createMany
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          runId: 'run-1',
          caseId: 'case-1',
          status: 'pass',
        }),
      ],
    });
    expect(prisma.assignmentTypeEvaluationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: 'completed',
        passedCases: 1,
        failedCases: 0,
        needsReviewCases: 0,
        completedAt: expect.any(Date),
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect((response as { data: any }).data).toMatchObject({
      success: true,
      runId: 'run-1',
      summary: { total: 1, passed: 1, failed: 0, needsReview: 0 },
    });
  });
});
