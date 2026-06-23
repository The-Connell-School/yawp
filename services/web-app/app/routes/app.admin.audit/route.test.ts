import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();
const prisma = {
  documentWriteJournal: {
    findMany: mock(),
    findUnique: mock(),
  },
  user: {
    findMany: mock(),
  },
  orgMembership: {
    findMany: mock(),
  },
  llmLog: {
    findMany: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));
mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

describe('admin audit loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireMutableRequest.mockReset();
    prisma.documentWriteJournal.findMany.mockReset();
    prisma.documentWriteJournal.findUnique.mockReset();
    prisma.user.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.llmLog.findMany.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    prisma.documentWriteJournal.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.llmLog.findMany.mockResolvedValue([
      {
        id: 'llm-1',
        createdAt: new Date('2026-06-23T12:00:00.000Z'),
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        durationMs: 900,
        systemPrompt: 'System prompt',
        messages: [{ role: 'user', content: 'Essay text' }],
        response: 'AI response',
        error: null,
        metadata: {
          feature: 'grading',
          kind: 'rubric-evaluation',
          documentSource: 'submission-snapshot',
          documentId: 'doc-1',
          submissionId: 'sub-1',
          documentTextLength: 20,
          documentTextSha256: 'sha-1',
          assignmentTypeId: 'assignment-type-1',
          assignmentTypeRubricSource: 'assignment-type',
          assignmentTypeGradingVersion: 3,
          rubricCategoryKeys: ['ideas', 'organization'],
        },
      },
    ]);
  });

  test('returns AI context logs filtered by normalized metadata', async () => {
    const request = new Request(
      'https://example.test/app/admin/audit?documentId=doc-1&submissionId=sub-1&feature=grading&kind=rubric-evaluation'
    );
    const response = await loader({
      request,
      params: {},
      url: new URL(request.url),
      pattern: '/app/admin/audit',
      context: {} as never,
    });
    const data = response.data as { aiLogs: unknown };

    expect(prisma.llmLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { metadata: { path: ['documentId'], equals: 'doc-1' } },
            { metadata: { path: ['submissionId'], equals: 'sub-1' } },
            { metadata: { path: ['feature'], equals: 'grading' } },
            {
              metadata: {
                path: ['kind'],
                equals: 'rubric-evaluation',
              },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    );
    expect(data.aiLogs).toEqual([
      expect.objectContaining({
        id: 'llm-1',
        feature: 'grading',
        kind: 'rubric-evaluation',
        documentSource: 'submission-snapshot',
        documentId: 'doc-1',
        submissionId: 'sub-1',
        documentTextLength: 20,
        documentTextSha256: 'sha-1',
        assignmentTypeId: 'assignment-type-1',
        assignmentTypeRubricSource: 'assignment-type',
        assignmentTypeGradingVersion: 3,
        rubricCategoryKeys: ['ideas', 'organization'],
        systemPrompt: 'System prompt',
        messages: [{ role: 'user', content: 'Essay text' }],
        response: 'AI response',
      }),
    ]);
  });
});
