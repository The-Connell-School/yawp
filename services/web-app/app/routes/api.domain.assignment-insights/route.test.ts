import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
  document: { findMany: mock() },
  classAssignmentInsight: { upsert: mock() },
};

const getGradingActor = mock();
const canManageGrades = mock();
const getLLMCompletion = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));
mock.module('~/utils/getLLMCompletion/getLLMCompletion', () => ({
  getLLMCompletion,
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
    prisma.classAssignment.findFirst.mockReset();
    prisma.document.findMany.mockReset();
    prisma.classAssignmentInsight.upsert.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    getLLMCompletion.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    prisma.classAssignment.findFirst.mockResolvedValue({
      id: 'ca-1',
      assignment: { title: 'Macbeth Essay' },
      class: {
        grade: '10',
        period: '3',
        school: { organization: { classInsightsEnabled: true } },
      },
    });
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
  });

  test('rejects non-graders with 403', async () => {
    canManageGrades.mockReturnValue(false);
    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);
    expect(payload.init?.status).toBe(403);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('returns 404 when the class-assignment is not owned by the teacher', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    const response = await action({ request: postRequest('ca-1') } as any);
    const payload = payloadOf(response);
    expect(payload.init?.status).toBe(404);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rejects direct generation requests while the organization gate is off', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({
      id: 'ca-1',
      assignment: { title: 'Macbeth Essay' },
      class: {
        grade: '10',
        period: '3',
        school: { organization: { classInsightsEnabled: false } },
      },
    });

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
    const upsertArgs = prisma.classAssignmentInsight.upsert.mock.calls[0][0];
    expect(upsertArgs.create.status).toBe('failed');
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
    const upsertArgs = prisma.classAssignmentInsight.upsert.mock.calls[0][0];
    expect(upsertArgs.create.status).toBe('failed');
    expect(upsertArgs.create.submissionCount).toBe(2);
  });

  test('passes a bounded request deadline to the insight model', async () => {
    await action({ request: postRequest('ca-1') } as any);

    const llmArgs = getLLMCompletion.mock.calls[0][0];
    expect(llmArgs.signal).toBeInstanceOf(AbortSignal);
  });
});
