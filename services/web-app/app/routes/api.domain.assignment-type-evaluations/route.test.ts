import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  assignmentType: { findUnique: mock(), update: mock() },
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
  assignmentTypePromptVersion: {
    count: mock(),
    findFirst: mock(),
    findUnique: mock(),
    create: mock(),
    update: mock(),
    updateMany: mock(),
  },
  assignmentTypeEvaluationSuiteVersion: {
    count: mock(),
    findFirst: mock(),
    findUnique: mock(),
    create: mock(),
  },
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
  evaluations: [{ id: 'evaluation-1' }],
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
    prisma.assignmentType.update.mockResolvedValue({ id: 'at-1' });
    prisma.assignmentTypeEvaluationRun.findFirst.mockResolvedValue(null);
    prisma.assignmentTypeEvaluation.count.mockResolvedValue(1);
    prisma.assignmentTypeEvaluation.create.mockResolvedValue({
      id: 'evaluation-new',
    });
    prisma.assignmentTypeEvaluation.updateMany.mockResolvedValue({ count: 1 });
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
    prisma.assignmentTypePromptVersion.count.mockResolvedValue(1);
    prisma.assignmentTypePromptVersion.findFirst.mockResolvedValue({
      id: 'prompt-production-7',
      assignmentTypeId: 'at-1',
      version: 7,
      revision: 1,
      status: 'production',
      systemMessageTemplate: 'Production system {{student_first_name}}',
      userMessageTemplate: 'Production user {{document}}',
      contentHash: 'production-hash',
    });
    prisma.assignmentTypePromptVersion.findUnique.mockResolvedValue({
      id: 'prompt-draft-8',
      assignmentTypeId: 'at-1',
      version: 8,
      revision: 2,
      status: 'draft',
      systemMessageTemplate: 'Draft system {{student_first_name}}',
      userMessageTemplate: 'Draft user {{rubric}} {{document}}',
      contentHash: 'draft-hash',
    });
    prisma.assignmentTypePromptVersion.create.mockResolvedValue({
      id: 'prompt-draft-8',
      version: 8,
      status: 'draft',
    });
    prisma.assignmentTypePromptVersion.update.mockResolvedValue({
      id: 'prompt-draft-8',
      version: 8,
      revision: 3,
      status: 'draft',
    });
    prisma.assignmentTypePromptVersion.updateMany.mockResolvedValue({
      count: 1,
    });
    prisma.assignmentTypeEvaluationSuiteVersion.count.mockResolvedValue(1);
    prisma.assignmentTypeEvaluationSuiteVersion.findFirst.mockResolvedValue({
      id: 'suite-1',
      assignmentTypeId: 'at-1',
      version: 1,
      contentHash: 'suite-hash',
      snapshotJson: {
        evaluations: [
          {
            id: 'evaluation-1',
            title: 'Claim feedback',
            description: 'The feedback identifies the claim.',
            position: 0,
            cases: assignmentType.evaluationCases,
          },
        ],
      },
    });
    prisma.assignmentTypeEvaluationSuiteVersion.findUnique.mockResolvedValue({
      id: 'suite-1',
      assignmentTypeId: 'at-1',
      version: 1,
      contentHash: 'suite-hash',
      snapshotJson: {
        evaluations: [
          {
            id: 'evaluation-1',
            title: 'Claim feedback',
            description: 'The feedback identifies the claim.',
            position: 0,
            cases: assignmentType.evaluationCases,
          },
        ],
      },
    });
    prisma.assignmentTypeEvaluationSuiteVersion.create.mockResolvedValue({
      id: 'suite-2',
      version: 2,
      contentHash: 'suite-2-hash',
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

  test('renames a saved evaluation and updates all of its editable cases', async () => {
    const expectedOutput = {
      categories: [
        { key: 'claim', score: 5, comment: 'The claim is precise.' },
      ],
      overallComment:
        'Jordan, you establish a strong position. Add one specific example.',
    };

    const response = await action({
      request: requestWith({
        intent: 'updateEvaluation',
        assignmentTypeId: 'at-1',
        evaluationId: 'evaluation-1',
        title: 'Encouraging opening',
        description:
          'Begin with specific encouragement before giving revision advice.',
        casesJson: JSON.stringify([
          {
            id: 'case-1',
            title: 'Clear position',
            documentText:
              'Uniforms should remain optional because narrower policies can address distractions without removing individuality.',
            expectedOutput,
          },
        ]),
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypeEvaluation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'evaluation-1',
        assignmentTypeId: 'at-1',
        archivedAt: null,
      },
      data: {
        title: 'Encouraging opening',
        description:
          'Begin with specific encouragement before giving revision advice.',
      },
    });
    expect(prisma.assignmentTypeEvaluationCase.updateMany).toHaveBeenCalledWith(
      {
        where: {
          id: 'case-1',
          evaluationId: 'evaluation-1',
          assignmentTypeId: 'at-1',
          archivedAt: null,
        },
        data: {
          title: 'Clear position',
          documentText:
            'Uniforms should remain optional because narrower policies can address distractions without removing individuality.',
          expectedOutputJson: expectedOutput,
          criterion:
            'Begin with specific encouragement before giving revision advice.',
        },
      }
    );
    expect((response as { data: any }).data).toEqual({ success: true });
    expect(
      prisma.assignmentTypeEvaluationSuiteVersion.create
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        version: 2,
        snapshotJson: expect.any(Object),
        contentHash: expect.any(String),
      }),
    });
  });

  test('creates an editable prompt draft from the current production prompt', async () => {
    const response = await action({
      request: requestWith({
        intent: 'createPromptDraft',
        assignmentTypeId: 'at-1',
        sourcePromptVersionId: 'prompt-production-7',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypePromptVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        version: 8,
        revision: 1,
        status: 'draft',
        systemMessageTemplate: expect.stringContaining('Production system'),
        userMessageTemplate: expect.stringContaining('Production user'),
      }),
    });
    expect((response as { data: any }).data).toMatchObject({
      success: true,
      promptVersionId: 'prompt-draft-8',
    });
  });

  test('updates a draft prompt revision without mutating production', async () => {
    const response = await action({
      request: requestWith({
        intent: 'updatePromptDraft',
        assignmentTypeId: 'at-1',
        promptVersionId: 'prompt-draft-8',
        systemMessageTemplate:
          'Be concise with {{student_first_name}} and use {{min_score}}-{{max_score}}.',
        userMessageTemplate:
          '{{assignment_type}}\n{{rubric}}\n{{grading_instructions}}\n{{document}}',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypePromptVersion.update).toHaveBeenCalledWith({
      where: { id: 'prompt-draft-8' },
      data: expect.objectContaining({
        revision: { increment: 1 },
        systemMessageTemplate: expect.stringContaining('Be concise'),
        userMessageTemplate: expect.stringContaining('{{document}}'),
        contentHash: expect.any(String),
      }),
    });
    expect((response as { data: any }).data).toMatchObject({
      success: true,
      promptVersionId: 'prompt-draft-8',
    });
  });

  test('blocks promotion until the current draft runs against the latest suite', async () => {
    const response = await action({
      request: requestWith({
        intent: 'promotePromptDraft',
        assignmentTypeId: 'at-1',
        promptVersionId: 'prompt-draft-8',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect((response as { init: { status: number } }).init.status).toBe(409);
    expect((response as { data: any }).data.message).toContain(
      'latest evaluation suite'
    );
    expect(prisma.assignmentTypePromptVersion.updateMany).not.toHaveBeenCalled();
  });

  test('promotes an evaluated draft and dual-writes the live prompt config', async () => {
    prisma.assignmentTypeEvaluationRun.findFirst.mockImplementation((args) =>
      Promise.resolve(
        args?.where?.status === 'completed'
          ? { id: 'run-current', passedCases: 5, totalCases: 6 }
          : null
      )
    );

    const response = await action({
      request: requestWith({
        intent: 'promotePromptDraft',
        assignmentTypeId: 'at-1',
        promptVersionId: 'prompt-draft-8',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypePromptVersion.updateMany).toHaveBeenCalledWith({
      where: { assignmentTypeId: 'at-1', status: 'production' },
      data: { status: 'previous' },
    });
    expect(prisma.assignmentTypePromptVersion.update).toHaveBeenCalledWith({
      where: { id: 'prompt-draft-8' },
      data: { status: 'production', promotedAt: expect.any(Date) },
    });
    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      data: expect.objectContaining({
        gradingAssistantVersion: 8,
        gradingPromptConfigJson: expect.objectContaining({
          systemMessageTemplate: expect.stringContaining('Draft system'),
          userMessageTemplate: expect.stringContaining('Draft user'),
        }),
      }),
    });
    expect((response as { data: any }).data).toMatchObject({
      success: true,
      status: 'production',
      runId: 'run-current',
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
    prisma.assignmentTypeEvaluationSuiteVersion.findFirst.mockResolvedValue({
      id: 'suite-empty',
      assignmentTypeId: 'at-1',
      version: 2,
      contentHash: 'empty-suite-hash',
      snapshotJson: { evaluations: [], legacyCases: [] },
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
      request: requestWith({
        intent: 'runSuite',
        assignmentTypeId: 'at-1',
        promptVersionId: 'prompt-draft-8',
        evaluationSuiteVersionId: 'suite-1',
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.assignmentTypeEvaluationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        promptVersion: 8,
        promptVersionId: 'prompt-draft-8',
        promptRevision: 2,
        evaluationSuiteVersionId: 'suite-1',
        evaluationSuiteContentHash: 'suite-hash',
        status: 'running',
        totalCases: 1,
        promptSnapshotJson: expect.objectContaining({
          compiledPrompt: expect.objectContaining({
            system: expect.stringContaining('Draft system'),
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
