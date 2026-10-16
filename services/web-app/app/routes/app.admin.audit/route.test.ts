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
    process.env.INTERNAL_ADMIN_AUDIT_MOVED = 'false';
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

describe('staged Audit entry migration', () => {
  test('enabled gate authorizes first and returns destination without reading payloads, including detailId', async () => {
    process.env.INTERNAL_ADMIN_AUDIT_MOVED = 'true';
    try {
      requireAdmin.mockReset().mockResolvedValue({ id: 'admin-1' });
      for (const delegate of Object.values(prisma))
        for (const method of Object.values(delegate)) method.mockClear();
      for (const suffix of ['', '?detailId=write-1']) {
        const result = await loader({
          request: new Request('http://platform.test/app/admin/audit' + suffix),
        } as any);
        expect(result.data).toMatchObject({
          moved: true,
          destination: 'https://internal.yawp.school/audit?env=demo',
        });
      }
      for (const delegate of Object.values(prisma))
        for (const method of Object.values(delegate))
          expect(method).not.toHaveBeenCalled();
      requireAdmin.mockRejectedValueOnce(
        new Response('Forbidden', { status: 403 })
      );
      try {
        await loader({
          request: new Request(
            'http://platform.test/app/admin/audit?detailId=write-1'
          ),
        } as any);
        throw new Error('allowed');
      } catch (error) {
        expect((error as Response).status).toBe(403);
      }
      requireAdmin.mockRejectedValueOnce(
        new Response('Login', { status: 302 })
      );
      try {
        await loader({
          request: new Request('http://platform.test/app/admin/audit'),
        } as any);
        throw new Error('allowed');
      } catch (error) {
        expect((error as Response).status).toBe(302);
      }
    } finally {
      delete process.env.INTERNAL_ADMIN_AUDIT_MOVED;
    }
  });
});
