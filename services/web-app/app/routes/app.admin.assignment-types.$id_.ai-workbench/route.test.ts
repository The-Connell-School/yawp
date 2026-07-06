import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
  },
  assignmentTypeAiEvaluationRun: {
    create: mock(),
  },
};

const requireAdmin = mock();
const requireMembership = mock();
const getLLMCompletion = mock();
const createAssignmentTypeAiSandboxLaunch = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin, requireMembership }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));
mock.module(
  '~/domain/assignment-types/assignment-type-ai-sandbox.server',
  () => ({
    createAssignmentTypeAiSandboxLaunch,
  })
);

const { action: routeAction, loader: routeLoader } = await import('./route');
const action = routeAction as any;
const loader = routeLoader as any;

describe('admin assignment type AI workbench loader', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
    prisma.assignmentTypeAiEvaluationRun.create.mockReset();
    getLLMCompletion.mockReset();
    requireAdmin.mockReset();
    requireMembership.mockReset();
    createAssignmentTypeAiSandboxLaunch.mockReset();
    requireAdmin.mockResolvedValue({ id: 'admin-user-1' });
    requireMembership.mockResolvedValue({ id: 'admin-membership-1' });
    prisma.assignmentTypeAiEvaluationRun.create.mockResolvedValue({
      id: 'run-1',
    });
    createAssignmentTypeAiSandboxLaunch.mockResolvedValue({
      runId: 'run-1',
      documentId: 'document-1',
      submissionId: 'submission-1',
    });
  });

  test('loads current assignment type AI config and builds prompt previews', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 0.4,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'module-1',
          title: 'Draft thesis',
          position: 0,
          description: null,
          tutorInstructions: 'Coach thesis revision.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Revise thesis',
              position: 0,
              prompt: 'Revise your thesis.',
              tutorInstructions: 'Ask one targeted thesis question.',
            },
          ],
        },
      ],
      aiVersions: [
        {
          id: 'version-3',
          versionNumber: 3,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Updated assignment type rubric and grading assistant',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: {
            id: 'admin-user-1',
            name: 'Bryant Brock',
            email: 'bryant@brock.software',
          },
        },
      ],
      aiEvaluationRuns: [
        {
          id: 'run-1',
          label: 'Advanced thesis check',
          agentKind: 'workbench-preview',
          status: 'saved',
          strictnessLevel: 'advanced',
          createdAt: new Date('2026-07-03T22:00:00.000Z'),
          createdByUser: {
            id: 'admin-user-1',
            name: 'Bryant Brock',
            email: 'bryant@brock.software',
          },
          assignmentTypeAiVersion: {
            id: 'version-3',
            versionNumber: 3,
          },
        },
      ],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(requireAdmin).toHaveBeenCalled();
    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith({
      where: { id: 'at-1' },
      include: expect.objectContaining({
        assignmentModules: expect.objectContaining({
          where: { deletedAt: null },
        }),
        aiVersions: expect.objectContaining({ take: 10 }),
        aiEvaluationRuns: expect.objectContaining({ take: 10 }),
      }),
    });
    expect((result as { data: any }).data.workbench.gradingPreview.userPrompt).toContain(
      'Use this shared rubric exactly.'
    );
    expect((result as { data: any }).data.workbench.tutorPreviews[0].systemPrompt).toContain(
      'Ask one targeted thesis question.'
    );
    expect((result as { data: any }).data.assignmentType.aiVersions).toHaveLength(
      1
    );
    expect(
      (result as { data: any }).data.assignmentType.aiEvaluationRuns
    ).toHaveLength(1);
  });

  test('applies sandbox query parameters to the prompt previews', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [],
      aiVersions: [],
      aiEvaluationRuns: [],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench?studentFirstName=Ava&strictnessLevel=advanced&sampleEssay=This%20draft%20has%20a%20specific%20claim.'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(data.controls).toEqual({
      studentFirstName: 'Ava',
      strictnessLevel: 'advanced',
      sampleEssay: 'This draft has a specific claim.',
    });
    expect(data.workbench.gradingPreview.userPrompt).toContain(
      'Student first name: Ava'
    );
    expect(data.workbench.gradingPreview.userPrompt).toContain(
      'Grading assistant strictness: Advanced'
    );
    expect(data.workbench.gradingPreview.userPrompt).toContain(
      'This draft has a specific claim.'
    );
  });

  test('replays prompt previews from a selected AI version snapshot', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Current Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'current',
            label: 'Current',
            description: 'Current rubric wording.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use the current rubric wording.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 8,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [],
      aiVersions: [
        {
          id: 'version-7',
          versionNumber: 7,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Saved version',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: null,
          snapshotJson: {
            schemaVersion: 1,
            assignmentType: {
              id: 'at-1',
              title: 'Historical Thesis Essay',
              kind: 'essay',
              description: null,
              gradingAssistantVersion: 7,
              scoringScaleJson: {
                type: 'weighted_0_5',
                minScore: 0,
                maxScore: 5,
              },
              rubricJson: {
                categories: [
                  {
                    key: 'historical',
                    label: 'Historical',
                    description: 'Historical rubric wording.',
                    weight: 1,
                  },
                ],
              },
              gradingPromptConfigJson: {
                gradingInstructions: 'Use the historical rubric wording.',
              },
              gradingOutputSchemaJson: null,
              gradingCalibrationNotes: null,
              gradingAssistantSourceTemplateId: null,
              gradingAssistantSourceTemplateSlug: null,
            },
            modules: [],
          },
        },
      ],
      aiEvaluationRuns: [],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench?versionId=version-7'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(data.selectedVersion).toMatchObject({
      id: 'version-7',
      versionNumber: 7,
    });
    expect(data.workbench.assignmentType.title).toBe('Historical Thesis Essay');
    expect(data.workbench.gradingPreview.userPrompt).toContain(
      'Use the historical rubric wording.'
    );
    expect(data.workbench.gradingPreview.userPrompt).not.toContain(
      'Use the current rubric wording.'
    );
    expect(data.versionComparison).toMatchObject({
      hasChanges: true,
      gradingPromptChanged: true,
      rubricCategories: {
        added: ['current'],
        removed: ['historical'],
        changed: [],
      },
    });
  });

  test('saves the current sandbox as an evaluation run', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [],
      aiVersions: [
        {
          id: 'version-3',
          versionNumber: 3,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Updated assignment type rubric and grading assistant',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: null,
        },
      ],
      aiEvaluationRuns: [],
    });

    const form = new FormData();
    form.set('intent', 'saveEvaluationRun');
    form.set('label', 'Advanced thesis check');
    form.set('notes', 'Kevin fixture for strict thesis calibration.');
    form.set('studentFirstName', 'Ava');
    form.set('strictnessLevel', 'advanced');
    form.set('sampleEssay', 'This draft has a specific claim.');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentTypeAiEvaluationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        assignmentTypeAiVersionId: 'version-3',
        createdByUserId: 'admin-user-1',
        agentKind: 'workbench-preview',
        status: 'saved',
        label: 'Advanced thesis check',
        notes: 'Kevin fixture for strict thesis calibration.',
        studentFirstName: 'Ava',
        strictnessLevel: 'advanced',
        sampleInput: 'This draft has a specific claim.',
        promptSnapshotJson: expect.objectContaining({
          schemaVersion: 1,
          gradingPreview: expect.objectContaining({
            userPrompt: expect.stringContaining('Student first name: Ava'),
          }),
        }),
      }),
    });
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toContain(
      'savedRun=run-1'
    );
  });

  test('runs the current sandbox as a completed deterministic evaluation', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'module-1',
          title: 'Draft thesis',
          position: 0,
          description: null,
          tutorInstructions: 'Coach thesis revision.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Revise thesis',
              position: 0,
              prompt: 'Revise your thesis.',
              tutorInstructions: 'Ask one targeted thesis question.',
            },
          ],
        },
      ],
      aiVersions: [
        {
          id: 'version-3',
          versionNumber: 3,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Updated assignment type rubric and grading assistant',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: null,
        },
      ],
      aiEvaluationRuns: [],
    });

    const form = new FormData();
    form.set('intent', 'runEvaluation');
    form.set('label', 'Run advanced thesis check');
    form.set('studentFirstName', 'Ava');
    form.set('strictnessLevel', 'advanced');
    form.set('sampleEssay', 'This draft has a specific claim.');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(prisma.assignmentTypeAiEvaluationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        assignmentTypeAiVersionId: 'version-3',
        createdByUserId: 'admin-user-1',
        agentKind: 'workbench-fixture',
        status: 'completed',
        label: 'Run advanced thesis check',
        studentFirstName: 'Ava',
        strictnessLevel: 'advanced',
        sampleInput: 'This draft has a specific claim.',
        resultJson: expect.objectContaining({
          schemaVersion: 1,
          mode: 'deterministic-workbench-fixture',
          gradingAssistant: expect.objectContaining({
            categories: [
              expect.objectContaining({
                key: 'thesis',
                score: 5,
              }),
            ],
          }),
          tutor: expect.objectContaining({
            responses: [
              expect.objectContaining({
                moduleTitle: 'Draft thesis',
                instructionTitle: 'Revise thesis',
              }),
            ],
          }),
        }),
      }),
    });
    expect((response as Response).headers.get('Location')).toContain(
      'runId=run-1'
    );
  });

  test('launches a tutor sandbox into the real document page', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'module-1',
          title: 'Draft thesis',
          position: 0,
          description: null,
          tutorInstructions: 'Coach thesis revision.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Revise thesis',
              position: 0,
              prompt: 'Revise your thesis.',
              tutorInstructions: 'Ask one targeted thesis question.',
            },
          ],
        },
      ],
      aiVersions: [
        {
          id: 'version-3',
          versionNumber: 3,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Updated assignment type rubric and grading assistant',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: null,
        },
      ],
      aiEvaluationRuns: [],
    });

    const form = new FormData();
    form.set('intent', 'launchTutorSandbox');
    form.set('label', 'Real tutor sandbox');
    form.set('studentFirstName', 'Ava');
    form.set('strictnessLevel', 'advanced');
    form.set('sampleEssay', 'This draft has a specific claim.');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(requireMembership).toHaveBeenCalled();
    expect(createAssignmentTypeAiSandboxLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentTypeId: 'at-1',
        assignmentTypeAiVersionId: 'version-3',
        createdByUserId: 'admin-user-1',
        membershipId: 'admin-membership-1',
        mode: 'tutor',
        label: 'Real tutor sandbox',
        controls: expect.objectContaining({
          studentFirstName: 'Ava',
          strictnessLevel: 'advanced',
          sampleEssay: 'This draft has a specific claim.',
        }),
      })
    );
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe(
      '/app/documents/document-1?aiWorkbenchRunId=run-1&exitTo=%2Fapp%2Fadmin%2Fassignment-types%2Fat-1%2Fai-workbench'
    );
  });

  test('launches a grading sandbox into the real submission grading page', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'module-1',
          title: 'Draft thesis',
          position: 0,
          description: null,
          tutorInstructions: 'Coach thesis revision.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Revise thesis',
              position: 0,
              prompt: 'Revise your thesis.',
              tutorInstructions: 'Ask one targeted thesis question.',
            },
          ],
        },
      ],
      aiVersions: [
        {
          id: 'version-3',
          versionNumber: 3,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Updated assignment type rubric and grading assistant',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: null,
        },
      ],
      aiEvaluationRuns: [],
    });

    const form = new FormData();
    form.set('intent', 'launchGradingSandbox');
    form.set('label', 'Real grading sandbox');
    form.set('studentFirstName', 'Ava');
    form.set('strictnessLevel', 'advanced');
    form.set('sampleEssay', 'This draft has a specific claim.');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(createAssignmentTypeAiSandboxLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentTypeId: 'at-1',
        assignmentTypeAiVersionId: 'version-3',
        createdByUserId: 'admin-user-1',
        membershipId: 'admin-membership-1',
        mode: 'grading',
        label: 'Real grading sandbox',
      })
    );
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe(
      '/app/submissions/submission-1?edit=1&aiWorkbenchRunId=run-1&exitTo=%2Fapp%2Fadmin%2Fassignment-types%2Fat-1%2Fai-workbench'
    );
  });

  test('runs the current sandbox as a completed live LLM evaluation', async () => {
    getLLMCompletion
      .mockResolvedValueOnce(
        '{"categories":[{"key":"thesis","score":4,"comment":"Live grading feedback."}],"overallComment":"Ava, live grading feedback."}'
      )
      .mockResolvedValueOnce('Live tutor response.');
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [
        {
          id: 'module-1',
          title: 'Draft thesis',
          position: 0,
          description: null,
          tutorInstructions: 'Coach thesis revision.',
          isSelfGuided: false,
          rubricAlignmentJson: { thesis: 'primary' },
          instructions: [
            {
              id: 'instruction-1',
              title: 'Revise thesis',
              position: 0,
              prompt: 'Revise your thesis.',
              tutorInstructions: 'Ask one targeted thesis question.',
            },
          ],
        },
      ],
      aiVersions: [
        {
          id: 'version-3',
          versionNumber: 3,
          changeSource: 'admin.assignment-type.update',
          changeSummary: 'Updated assignment type rubric and grading assistant',
          createdAt: new Date('2026-07-03T21:00:00.000Z'),
          createdByUser: null,
        },
      ],
      aiEvaluationRuns: [],
    });

    const form = new FormData();
    form.set('intent', 'runLiveEvaluation');
    form.set('label', 'Live thesis check');
    form.set('studentFirstName', 'Ava');
    form.set('strictnessLevel', 'advanced');
    form.set('sampleEssay', 'This draft has a specific claim.');

    const response = await action({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench',
        {
          method: 'POST',
          body: form,
        }
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    expect(getLLMCompletion).toHaveBeenCalledTimes(2);
    expect(getLLMCompletion.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        system: expect.stringContaining('You are a grading assistant'),
        metadata: expect.objectContaining({
          feature: 'admin-ai-workbench',
          kind: 'grading-assistant',
        }),
      })
    );
    expect(getLLMCompletion.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        system: expect.stringContaining('Coach thesis revision.'),
        metadata: expect.objectContaining({
          feature: 'admin-ai-workbench',
          kind: 'tutor',
        }),
      })
    );
    expect(prisma.assignmentTypeAiEvaluationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentTypeId: 'at-1',
        assignmentTypeAiVersionId: 'version-3',
        createdByUserId: 'admin-user-1',
        agentKind: 'workbench-live',
        status: 'completed',
        label: 'Live thesis check',
        resultJson: expect.objectContaining({
          schemaVersion: 1,
          mode: 'live-workbench-llm',
          gradingAssistant: expect.objectContaining({
            rawResponse: expect.stringContaining('Live grading feedback'),
          }),
          tutor: expect.objectContaining({
            responses: [
              expect.objectContaining({
                rawResponse: 'Live tutor response.',
              }),
            ],
          }),
        }),
      }),
    });
    expect((response as Response).headers.get('Location')).toContain(
      'runId=run-1'
    );
  });

  test('returns selected evaluation run details without bloating the run list', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'at-1',
      title: 'Thesis Essay',
      kind: 'essay',
      description: null,
      scoringScaleJson: {
        type: 'weighted_0_5',
        minScore: 0,
        maxScore: 5,
      },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Defensible and specific thesis.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Use this shared rubric exactly.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 3,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
      assignmentModules: [],
      aiVersions: [],
      aiEvaluationRuns: [
        {
          id: 'run-1',
          label: 'Advanced thesis check',
          notes: 'Kevin fixture.',
          agentKind: 'workbench-preview',
          status: 'saved',
          studentFirstName: 'Ava',
          strictnessLevel: 'advanced',
          sampleInput: 'This draft has a specific claim.',
          promptSnapshotJson: {
            schemaVersion: 1,
            gradingPreview: {
              system: 'Saved grading system prompt.',
              userPrompt: 'Saved grading user prompt.',
            },
            tutorPreviews: [
              {
                moduleTitle: 'Draft thesis',
                instructionTitle: 'Revise thesis',
                systemPrompt: 'Saved tutor prompt.',
              },
            ],
          },
          createdAt: new Date('2026-07-03T22:00:00.000Z'),
          createdByUser: {
            id: 'admin-user-1',
            name: 'Bryant Brock',
            email: 'bryant@brock.software',
          },
          assignmentTypeAiVersion: {
            id: 'version-3',
            versionNumber: 3,
          },
        },
      ],
    });

    const result = await loader({
      request: new Request(
        'https://example.test/app/admin/assignment-types/at-1/ai-workbench?runId=run-1'
      ),
      params: { id: 'at-1' },
      context: {} as never,
    });

    const data = (result as { data: any }).data;
    expect(data.selectedRun).toMatchObject({
      id: 'run-1',
      label: 'Advanced thesis check',
      promptSnapshotJson: expect.objectContaining({
        gradingPreview: expect.objectContaining({
          userPrompt: 'Saved grading user prompt.',
        }),
      }),
    });
    expect(data.assignmentType.aiEvaluationRuns[0].promptSnapshotJson).toBe(
      undefined
    );
  });

  test('returns 404 when the assignment type is missing', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue(null);

    await expect(
      loader({
        request: new Request(
          'https://example.test/app/admin/assignment-types/missing/ai-workbench'
        ),
        params: { id: 'missing' },
        context: {} as never,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});
