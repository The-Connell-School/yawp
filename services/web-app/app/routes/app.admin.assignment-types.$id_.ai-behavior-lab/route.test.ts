import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: { findUnique: mock() },
  assignmentTypePromptVersion: { findMany: mock() },
  assignmentTypeEvaluationRun: { findMany: mock() },
};
const requireAdmin = mock();
const isAiBehaviorEvalLabEnabled = mock();
const createAiPromptDraft = mock();
const updateAiPromptDraft = mock();
const reviewAiPromptCalibration = mock();
const promoteAiPromptVersion = mock();
const rollbackAiPromptVersion = mock();
const runAiBehaviorEvaluation = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/domain/ai-evaluation/prompt-version-control.server', () => ({
  isAiBehaviorEvalLabEnabled,
  createAiPromptDraft,
  updateAiPromptDraft,
  reviewAiPromptCalibration,
  promoteAiPromptVersion,
  rollbackAiPromptVersion,
}));
mock.module(
  '~/domain/ai-evaluation/ai-behavior-evaluation-runner.server',
  () => ({ runAiBehaviorEvaluation })
);

const { action, loader } = await import('./route');
const routeAction = action as any;
const routeLoader = loader as any;

function postForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return new Request(
    'https://example.test/app/admin/assignment-types/type-1/ai-behavior-lab',
    { method: 'POST', body: formData }
  );
}

function responseData(result: unknown) {
  return (result as { data: { status: string; error?: string } }).data;
}

describe('admin AI behavior evaluation lab route', () => {
  beforeEach(() => {
    for (const value of [
      prisma.assignmentType.findUnique,
      prisma.assignmentTypePromptVersion.findMany,
      prisma.assignmentTypeEvaluationRun.findMany,
      requireAdmin,
      isAiBehaviorEvalLabEnabled,
      createAiPromptDraft,
      updateAiPromptDraft,
      reviewAiPromptCalibration,
      promoteAiPromptVersion,
      rollbackAiPromptVersion,
      runAiBehaviorEvaluation,
    ]) {
      value.mockReset();
    }
    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    isAiBehaviorEvalLabEnabled.mockReturnValue(true);
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'type-1',
      title: 'Argument Writing',
    });
    prisma.assignmentTypePromptVersion.findMany.mockResolvedValue([]);
    prisma.assignmentTypeEvaluationRun.findMany.mockResolvedValue([]);
    createAiPromptDraft.mockResolvedValue({ id: 'draft-1' });
    updateAiPromptDraft.mockResolvedValue({ id: 'draft-1' });
    reviewAiPromptCalibration.mockResolvedValue({ id: 'run-1' });
    promoteAiPromptVersion.mockResolvedValue({ id: 'draft-1' });
    rollbackAiPromptVersion.mockResolvedValue({
      rolledBackTo: 'canonical-runtime-v1',
    });
    runAiBehaviorEvaluation.mockResolvedValue({ id: 'run-1' });
  });

  test('requires admin access and loads only assignment-scoped safe summaries', async () => {
    const request = new Request(
      'https://example.test/app/admin/assignment-types/type-1/ai-behavior-lab'
    );
    const result = await routeLoader({
      request,
      params: { id: 'type-1' },
      context: {} as never,
    });

    expect(requireAdmin).toHaveBeenCalledWith(request);
    expect(prisma.assignmentTypePromptVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignmentTypeId: 'type-1' } })
    );
    expect(prisma.assignmentTypeEvaluationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignmentTypeId: 'type-1' },
        take: 25,
      })
    );
    const runSelect =
      prisma.assignmentTypeEvaluationRun.findMany.mock.calls[0][0].select;
    expect(runSelect.resultJson).toBeUndefined();
    expect(runSelect.suiteSnapshotJson).toBeUndefined();
    expect(
      (result as { data: { evaluationRuns: unknown[] } }).data.evaluationRuns
    ).toEqual([]);
  });

  test('returns 404 before reading lab data when the production gate is off', async () => {
    isAiBehaviorEvalLabEnabled.mockReturnValue(false);
    try {
      await routeLoader({
        request: new Request('https://example.test/lab'),
        params: { id: 'type-1' },
        context: {} as never,
      });
      throw new Error('expected loader to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(404);
    }
    expect(prisma.assignmentType.findUnique).not.toHaveBeenCalled();
  });

  test('routes every lifecycle action with the authenticated admin and assignment scope', async () => {
    const cases: Array<{
      fields: Record<string, string>;
      fn: any;
      expected: any;
    }> = [
      {
        fields: { intent: 'create-draft', surface: 'tutor' },
        fn: createAiPromptDraft,
        expected: {
          assignmentTypeId: 'type-1',
          surface: 'tutor',
          authorUserId: 'admin-1',
        },
      },
      {
        fields: {
          intent: 'save-draft',
          surface: 'grading',
          promptVersionId: 'prompt-1',
          systemMessage: '{{base_system}}',
          userMessage:
            '{{base_user_message}} {{assignment_prompt}} {{rubric_version}}',
        },
        fn: updateAiPromptDraft,
        expected: expect.objectContaining({
          assignmentTypeId: 'type-1',
          promptVersionId: 'prompt-1',
          surface: 'grading',
        }),
      },
      {
        fields: { intent: 'run-evaluation', promptVersionId: 'prompt-1' },
        fn: runAiBehaviorEvaluation,
        expected: {
          assignmentTypeId: 'type-1',
          promptVersionId: 'prompt-1',
          runByUserId: 'admin-1',
        },
      },
      {
        fields: { intent: 'review-calibration', runId: 'run-1' },
        fn: reviewAiPromptCalibration,
        expected: {
          assignmentTypeId: 'type-1',
          runId: 'run-1',
          reviewerUserId: 'admin-1',
        },
      },
      {
        fields: {
          intent: 'promote',
          promptVersionId: 'prompt-1',
          runId: 'run-1',
        },
        fn: promoteAiPromptVersion,
        expected: {
          assignmentTypeId: 'type-1',
          promptVersionId: 'prompt-1',
          runId: 'run-1',
        },
      },
      {
        fields: {
          intent: 'rollback',
          surface: 'tutor',
          productionVersionId: 'prompt-1',
        },
        fn: rollbackAiPromptVersion,
        expected: {
          assignmentTypeId: 'type-1',
          surface: 'tutor',
          productionVersionId: 'prompt-1',
        },
      },
    ];

    for (const item of cases) {
      const result = await routeAction({
        request: postForm(item.fields),
        params: { id: 'type-1' },
        context: {} as never,
      });
      expect(responseData(result).status).toBe('success');
      expect(item.fn).toHaveBeenLastCalledWith(item.expected);
    }
  });

  test('rejects invalid surfaces before calling prompt mutation code', async () => {
    const result = await routeAction({
      request: postForm({
        intent: 'save-draft',
        surface: 'other',
        promptVersionId: 'prompt-1',
        systemMessage: 'system',
        userMessage: 'user',
      }),
      params: { id: 'type-1' },
      context: {} as never,
    });
    expect((result as { init: { status: number } }).init.status).toBe(400);
    expect(responseData(result).error).toBe('Select a valid prompt surface.');
    expect(updateAiPromptDraft).not.toHaveBeenCalled();
  });

  test('sanitizes unexpected provider and database errors', async () => {
    runAiBehaviorEvaluation.mockRejectedValue(
      new Error('provider body EVAL_SECRET_216 at postgres://private')
    );
    const result = await routeAction({
      request: postForm({
        intent: 'run-evaluation',
        promptVersionId: 'prompt-1',
      }),
      params: { id: 'type-1' },
      context: {} as never,
    });
    expect(responseData(result).error).toBe(
      'The requested prompt action could not be completed.'
    );
    expect(JSON.stringify(responseData(result))).not.toContain(
      'EVAL_SECRET_216'
    );
  });
});
