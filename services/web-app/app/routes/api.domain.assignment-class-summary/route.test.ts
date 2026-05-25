import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignment: { findFirst: mock() },
  document: { findMany: mock(), count: mock() },
  submission: { findMany: mock(), count: mock() },
  assignmentClassSummary: { findUnique: mock(), upsert: mock() },
};

const getLLMCompletion = mock();
const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/getLLMCompletion', () => ({ getLLMCompletion }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { action } = await import('./route');

type ActionResult = { data: Record<string, any>; status?: number };

function getData(result: unknown): Record<string, any> {
  const r = result as ActionResult;
  return r.data ?? (r as any);
}

function getStatus(result: unknown): number {
  const r = result as any;
  if (r.init?.status) return r.init.status;
  if (r.status) return r.status;
  return 200;
}

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/domain/assignment-class-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockTeacherProfile() {
  requireUserId.mockResolvedValue('user-1');
  requireMembership.mockResolvedValue({
    id: 'profile-1',
    role: 'TEACHER',
  });
}

function mockAssignment() {
  prisma.assignment.findFirst.mockResolvedValue({
    id: 'assign-1',
    title: 'Macbeth Essay',
    prompt: 'Write about Macbeth',
    assignmentType: { title: 'Essay' },
    classAssignments: [{ class: { grade: '11', period: '3' } }],
  });
}

function mockSubmissions(gradedCount: number, totalDocs: number) {
  prisma.document.count.mockResolvedValue(totalDocs);
  prisma.submission.count.mockResolvedValue(gradedCount);

  prisma.document.findMany.mockResolvedValue(
    Array.from({ length: totalDocs }, (_, i) => ({ id: `doc-${i}` }))
  );
  prisma.submission.findMany.mockResolvedValue(
    Array.from({ length: gradedCount }, (_, i) => ({
      id: `sub-${i}`,
      rubricScores: { thesis: { score: 3, comment: 'ok' } },
      overallScore: 3,
      overallComment: `Student ${i} did ok`,
      numericPercentage: 75,
      letterGrade: 'C',
      feedback: null,
    }))
  );
}

const validSummary = {
  version: 1,
  strengths: ['Good textual evidence', 'Clear understanding of themes'],
  weaknesses: ['Thesis too broad', 'Conclusions weak'],
  focusAreas: ['Thesis specificity', 'Evidence analysis'],
};

function mockLLMResponse() {
  getLLMCompletion.mockResolvedValue(JSON.stringify(validSummary));
}

beforeEach(() => {
  mock.restore();
  for (const model of Object.values(prisma)) {
    for (const fn of Object.values(model)) {
      (fn as ReturnType<typeof mock>).mockReset();
    }
  }
  getLLMCompletion.mockReset();
  requireUserId.mockReset();
  requireMembership.mockReset();
});

describe('assignment-class-summary action', () => {
  test('rejects non-teacher users', async () => {
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'STUDENT',
    });

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    expect(getStatus(result)).toBe(403);
  });

  test('rejects missing assignmentId', async () => {
    mockTeacherProfile();

    const result = await action({
      request: buildRequest({}),
      params: {},
      context: {},
    } as any);

    expect(getStatus(result)).toBe(400);
  });

  test('returns 404 when assignment not found', async () => {
    mockTeacherProfile();
    prisma.assignment.findFirst.mockResolvedValue(null);

    const result = await action({
      request: buildRequest({ assignmentId: 'nonexistent' }),
      params: {},
      context: {},
    } as any);

    expect(getStatus(result)).toBe(404);
  });

  test('rejects when below 50% graded', async () => {
    mockTeacherProfile();
    mockAssignment();
    mockSubmissions(2, 10);

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    expect(getStatus(result)).toBe(400);
    const data = getData(result);
    expect(data.message).toContain('Not enough graded');
  });

  test('rejects when below minimum absolute floor of 3', async () => {
    mockTeacherProfile();
    mockAssignment();
    mockSubmissions(2, 3);

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    expect(getStatus(result)).toBe(400);
  });

  test('generates summary when ≥50% graded', async () => {
    mockTeacherProfile();
    mockAssignment();
    mockSubmissions(6, 10);
    mockLLMResponse();

    prisma.assignmentClassSummary.upsert.mockResolvedValue({
      id: 'summary-1',
      assignmentId: 'assign-1',
      generatedAt: new Date(),
      gradedAtGeneration: 6,
      totalAtGeneration: 10,
      summaryJson: validSummary,
      lastMilestone: 50,
    });

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    const data = getData(result);
    expect(data.success).toBe(true);
    expect(data.summary.summaryJson.strengths).toHaveLength(2);
    expect(data.summary.summaryJson.focusAreas).toHaveLength(2);
    expect(prisma.assignmentClassSummary.upsert).toHaveBeenCalled();
  });

  test('sets correct milestone at 75%', async () => {
    mockTeacherProfile();
    mockAssignment();
    mockSubmissions(8, 10);
    mockLLMResponse();

    prisma.assignmentClassSummary.upsert.mockImplementation(
      async (args: any) => ({
        id: 'summary-1',
        ...args.create,
      })
    );

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    const data = getData(result);
    expect(data.success).toBe(true);
    expect(data.summary.lastMilestone).toBe(75);
  });

  test('sets correct milestone at 90%', async () => {
    mockTeacherProfile();
    mockAssignment();
    mockSubmissions(9, 10);
    mockLLMResponse();

    prisma.assignmentClassSummary.upsert.mockImplementation(
      async (args: any) => ({
        id: 'summary-1',
        ...args.create,
      })
    );

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    const data = getData(result);
    expect(data.success).toBe(true);
    expect(data.summary.lastMilestone).toBe(90);
  });

  test('returns 502 when LLM call fails', async () => {
    mockTeacherProfile();
    mockAssignment();
    mockSubmissions(6, 10);
    getLLMCompletion.mockRejectedValue(new Error('LLM unavailable'));

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    expect(getStatus(result)).toBe(502);
  });

  test('returns 502 when LLM returns malformed JSON', async () => {
    mockTeacherProfile();
    mockAssignment();
    mockSubmissions(6, 10);
    getLLMCompletion.mockResolvedValue('not valid json');

    const result = await action({
      request: buildRequest({ assignmentId: 'assign-1' }),
      params: {},
      context: {},
    } as any);

    expect(getStatus(result)).toBe(502);
  });
});
