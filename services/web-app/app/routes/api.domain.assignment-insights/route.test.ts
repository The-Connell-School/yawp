import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Prisma } from '@app/prisma';

const prisma = {
  classAssignment: { findFirst: mock() },
  document: { findMany: mock() },
  classAssignmentInsight: {
    findUnique: mock(),
    upsert: mock(),
    updateMany: mock(),
    create: mock(),
  },
};

const GENERATION_CLASS_ASSIGNMENT = {
  id: 'ca-1',
  assignment: { title: 'Macbeth Essay' },
  class: {
    grade: '10',
    period: '3',
    school: {
      organizationId: 'org-1',
      organization: { classInsightsEnabled: true },
    },
  },
};

function mockClassAssignmentAccess(
  generationResult: typeof GENERATION_CLASS_ASSIGNMENT | null = GENERATION_CLASS_ASSIGNMENT
) {
  prisma.classAssignment.findFirst.mockImplementation(async (args: {
    select?: Record<string, boolean>;
  }) => {
    const isAuthCheck =
      args.select?.id === true && Object.keys(args.select).length === 1;
    if (isAuthCheck) {
      return generationResult ? { id: 'ca-1' } : null;
    }
    return generationResult;
  });
}

const getGradingActor = mock();
const canManageGrades = mock();
const getLLMCompletion = mock();
const reserveAiRequest = mock();
class AiRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('rate limited');
  }
}

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));
mock.module('~/utils/getLLMCompletion/getLLMCompletion', () => ({
  getLLMCompletion,
}));
mock.module('~/utils/ai-admission.server', () => ({
  AiRateLimitError,
  reserveAiRequest,
}));

const { action } = await import('./route');

const VALID_LLM_PAYLOAD = JSON.stringify({
  overview: 'The class writes strong theses but struggles to analyze evidence.',
  categories: [
    {
      key: 'thesis_and_content',
      status: 'strength',
      summary: 'Nearly every student opened with a clear claim.',
    },
    {
      key: 'evidence_and_support',
      status: 'gap',
      summary: 'Most quotes are dropped in without analysis.',
    },
  ],
  nextSteps: [
    {
      title: 'Model quote analysis',
      detail: 'Do a whole-class think-aloud unpacking one quotation.',
      rubricCategory: 'evidence_and_support',
    },
  ],
});

function postRequest(classAssignmentId: string | null) {
  const form = new FormData();
  if (classAssignmentId !== null) {
    form.append('classAssignmentId', classAssignmentId);
  }
  return new Request('https://example.com/api/domain/assignment-insights', {
    method: 'POST',
    body: form,
  });
}

function payloadOf(response: unknown) {
  return response as {
    data: Record<string, unknown>;
    init?: { status?: number };
  };
}

describe('api.domain.assignment-insights', () => {
  beforeEach(() => {
    process.env.CLASS_INSIGHT_MOCK_MODE = 'live';
    prisma.classAssignment.findFirst.mockReset();
    prisma.document.findMany.mockReset();
    prisma.classAssignmentInsight.findUnique.mockReset().mockResolvedValue(null);
    prisma.classAssignmentInsight.upsert.mockReset();
    prisma.classAssignmentInsight.updateMany.mockReset().mockResolvedValue({
      count: 0,
    });
    prisma.classAssignmentInsight.create.mockReset().mockResolvedValue({
      id: 'insight-failed',
    });
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    getLLMCompletion.mockReset();
    reserveAiRequest.mockReset().mockResolvedValue(undefined);

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    mockClassAssignmentAccess();
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        submissions: [
          {
            id: 'sub-1',
            rubricScores: {
              thesis_and_content: { score: 5, comment: 'Sharp thesis.' },
              evidence_and_support: { score: 2, comment: 'Not analyzed.' },
            },
            overallComment: 'Nice start, dig into evidence.',
          },
        ],
      },
      {
        id: 'doc-2',
        submissions: [
          {
            id: 'sub-2',
            rubricScores: {
              thesis_and_content: { score: 4, comment: 'Clear claim.' },
              evidence_and_support: { score: 2, comment: 'Explain quotes.' },
            },
            overallComment: 'Work on evidence.',
          },
        ],
      },
    ]);
    getLLMCompletion.mockResolvedValue(VALID_LLM_PAYLOAD);
    prisma.classAssignmentInsight.upsert.mockImplementation(
      async ({ create }: any) => ({
        id: 'insight-1',
        ...create,
      })
    );
  });

  test('rejects regeneration while the 24-hour cooldown is active', async () => {
    prisma.classAssignmentInsight.findUnique.mockResolvedValue({
      status: 'ready',
      generatedAt: new Date(Date.now() - 60 * 60 * 1000),
      summaryJson: { overview: 'Cached summary.' },
    });

    const response = await action({
      request: postRequest('ca-1'),
    } as any);
    const payload = payloadOf(response);

    expect(payload.init?.status).toBe(429);
    expect(payload.data.success).toBe(false);
    expect(payload.data.message).toMatch(/regenerate in \d+ hours/i);
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prisma.classAssignmentInsight.upsert).not.toHaveBeenCalled();
  });

  test('rejects regeneration when nothing new has been graded since the last summary', async () => {
    prisma.classAssignmentInsight.findUnique.mockResolvedValue({
      status: 'ready',
      generatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      summaryJson: { overview: 'Cached summary.' },
      submissionCount: 2,
    });

    const response = await action({
      request: postRequest('ca-1'),
    } as any);
    const payload = payloadOf(response);

    expect(payload.init?.status).toBe(409);
    expect(payload.data).toEqual({
      success: false,
      message: 'No new graded submissions since the last summary.',
    });
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prisma.classAssignmentInsight.upsert).not.toHaveBeenCalled();
  });

  test('allows regeneration once the cooldown ends and new submissions were graded', async () => {
    prisma.classAssignmentInsight.findUnique.mockResolvedValue({
      status: 'ready',
      generatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      summaryJson: { overview: 'Cached summary.' },
      submissionCount: 1,
    });

    const response = await action({
      request: postRequest('ca-1'),
    } as any);
    const payload = payloadOf(response);

    expect(payload.data.success).toBe(true);
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
  });

  test('generates and persists an insight for a teacher who owns the class', async () => {
    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(prisma.classAssignmentInsight.upsert).toHaveBeenCalledTimes(1);

    const upsertArgs = prisma.classAssignmentInsight.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ classAssignmentId: 'ca-1' });
    expect(upsertArgs.create.submissionCount).toBe(2);
    expect(upsertArgs.create.status).toBe('ready');
    expect(upsertArgs.create.generatedByMembershipId).toBe('teacher-1');

    expect(payload.data.success).toBe(true);
    const summary = (payload.data.insight as any).summary;
    expect(summary.overview).toContain('strong theses');
    expect(summary.nextSteps[0].rubricCategory).toBe('evidence_and_support');
  });

  test('stores differentiation starting points with the summary, without sending names to the LLM', async () => {
    // Ana struggles across the board; Ben and Cara share an evidence gap
    // (with Ana, still a minority of the class); Dev is strong everywhere.
    const lowScores = {
      thesis_and_content: { score: 2, comment: '' },
      evidence_and_support: { score: 1, comment: '' },
    };
    const strongScores = {
      thesis_and_content: { score: 5, comment: '' },
      evidence_and_support: { score: 4, comment: '' },
    };
    const midScores = {
      thesis_and_content: { score: 3, comment: '' },
      evidence_and_support: { score: 3, comment: '' },
    };
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        membership: { user: { name: 'Ana Reyes', email: 'ana@school.test' } },
        submissions: [
          { id: 'sub-1', rubricScores: lowScores, overallComment: null },
        ],
      },
      {
        id: 'doc-2',
        membership: { user: { name: null, email: 'ben@school.test' } },
        submissions: [
          {
            id: 'sub-2',
            rubricScores: {
              thesis_and_content: { score: 4, comment: '' },
              evidence_and_support: { score: 2, comment: '' },
            },
            overallComment: null,
          },
        ],
      },
      {
        id: 'doc-3',
        membership: { user: { name: 'Dev Patel', email: 'dev@school.test' } },
        submissions: [
          { id: 'sub-3', rubricScores: strongScores, overallComment: null },
        ],
      },
      ...['doc-4', 'doc-5', 'doc-6'].map((id, index) => ({
        id,
        membership: { user: { name: `Mid ${index}`, email: null } },
        submissions: [
          {
            id: `sub-mid-${index}`,
            rubricScores: midScores,
            overallComment: null,
          },
        ],
      })),
    ]);

    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);
    expect(payload.data.success).toBe(true);

    const summary = (payload.data.insight as any).summary;
    const differentiation = summary.differentiation;
    expect(differentiation).toBeTruthy();

    const evidenceGroup = differentiation.focusGroups.find(
      (group: any) => group.category === 'evidence_and_support'
    );
    expect(evidenceGroup.students.map((s: any) => s.name)).toEqual([
      'Ana Reyes',
      'ben@school.test',
    ]);
    expect(evidenceGroup.students[0].href).toBe('/app/submissions/sub-1');

    const kinds = differentiation.individuals.map((flag: any) => [
      flag.kind,
      flag.student.name,
    ]);
    expect(kinds).toContainEqual(['support', 'Ana Reyes']);
    expect(kinds).toContainEqual(['extension', 'Dev Patel']);

    // The cached row carries the same enriched summary.
    const upsertArgs = prisma.classAssignmentInsight.upsert.mock.calls[0][0];
    expect(upsertArgs.create.summaryJson.differentiation).toEqual(
      differentiation
    );

    // Student identities stay out of the LLM prompt.
    const llmArgs = getLLMCompletion.mock.calls[0][0];
    const promptText = JSON.stringify(llmArgs);
    expect(promptText).not.toContain('Ana Reyes');
    expect(promptText).not.toContain('ben@school.test');
    expect(promptText).not.toContain('Dev Patel');
    expect(promptText).not.toContain('Sharp thesis.');
    expect(promptText).not.toContain('Not analyzed.');
    expect(promptText).not.toContain('Nice start, dig into evidence.');
    expect(llmArgs.logPayload).toBe('metadata-only');
    expect(llmArgs.allowFallbackProvider).toBe(false);
  });

  test('rejects non-graders with 403', async () => {
    canManageGrades.mockReturnValue(false);
    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);
    expect(payload.init?.status).toBe(403);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('returns 404 when the class-assignment is not owned by the teacher', async () => {
    mockClassAssignmentAccess(null);
    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);
    expect(payload.init?.status).toBe(404);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rejects direct generation requests while the organization gate is off', async () => {
    mockClassAssignmentAccess(null);

    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);

    expect(payload.init?.status).toBe(404);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('returns a friendly 400 when there are no graded submissions', async () => {
    prisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', submissions: [] },
    ]);
    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);
    expect(payload.init?.status).toBe(400);
    expect(payload.data.success).toBe(false);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('validates the classAssignmentId is present', async () => {
    const response = await action({ request: postRequest(null) } as any);
    const payload = payloadOf(response);
    expect(payload.init?.status).toBe(400);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('persists a failed status and returns 502 when the model output is unusable', async () => {
    getLLMCompletion.mockResolvedValue('the model refused to answer');
    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);
    expect(payload.init?.status).toBe(502);
    const createArgs = prisma.classAssignmentInsight.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe('failed');
  });

  test('contains provider failures, persists failed status, and returns a generic error', async () => {
    getLLMCompletion.mockRejectedValue(
      new Error('provider-secret: upstream request id abc123')
    );

    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);

    expect(payload.init?.status).toBe(502);
    expect(payload.data).toEqual({
      success: false,
      message: 'Class insights are temporarily unavailable. Please try again.',
    });
    expect(JSON.stringify(payload.data)).not.toContain('provider-secret');
    const createArgs = prisma.classAssignmentInsight.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe('failed');
    expect(createArgs.data.submissionCount).toBe(2);
  });

  test('a failed regeneration cannot overwrite the last ready summary', async () => {
    getLLMCompletion.mockRejectedValue(new Error('provider unavailable'));
    prisma.classAssignmentInsight.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('existing ready row', {
        code: 'P2002',
        clientVersion: '7.8.0',
      })
    );

    const response = await action({ request: postRequest('ca-1') } as any);

    expect(payloadOf(response).init?.status).toBe(502);
    expect(prisma.classAssignmentInsight.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classAssignmentId: 'ca-1', status: 'failed' },
      })
    );
    expect(prisma.classAssignmentInsight.upsert).not.toHaveBeenCalled();
  });

  test('passes a bounded request deadline to the insight model', async () => {
    await action({ request: postRequest('ca-1') } as any);

    const llmArgs = getLLMCompletion.mock.calls[0][0];
    expect(llmArgs.signal).toBeInstanceOf(AbortSignal);
  });
});
