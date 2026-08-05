import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();
const requireMutableRequest = mock();
const requireAdmin = mock();
const prisma = {
  assignmentModuleSession: {
    findUnique: mock(),
    update: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({ requireMutableRequest, requireAdmin }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: {
    Assistant: 'assistant',
    User: 'user',
  },
  getLLMCompletion,
}));

const { LlmFallbackRetrySignal } = await import(
  '~/utils/getLLMCompletion/llm-provider-errors.server'
);
const { action } = await import('./route');

describe('api.domain.tutor-response read-only impersonation', () => {
  beforeEach(() => {
    getLLMCompletion.mockReset();
    requireMutableRequest.mockReset();
    requireAdmin.mockReset();
    requireMutableRequest.mockResolvedValue(undefined);
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
  });

  function mockCms() {
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      instructionsCompleted: 0,
      assignmentModule: {
        tutorInstructions: 'Coach the student.',
        rubricAlignmentJson: {
          thesis_and_content: 'primary',
          grammar_and_mechanics: 'not-applicable',
        },
        assignmentType: {
          id: 'assignment-type-1',
          gradingAssistantVersion: 7,
          rubricJson: {
            categories: [
              {
                key: 'thesis_and_content',
                label: 'Thesis/Content',
                description: 'Original, defensible thesis.',
                weight: 0.25,
              },
              {
                key: 'grammar_and_mechanics',
                label: 'Grammar/Syntax/Formatting',
                description: 'Technical correctness.',
                weight: 0.1,
              },
            ],
          },
        },
        instructions: [
          {
            id: 'instruction-1',
            tutorInstructions: 'Focus on thesis clarity.',
          },
        ],
      },
      messages: [],
      document: {
        id: 'doc-1',
        text: 'Original draft',
      },
    });
  }

  test('preserves the read-only mutation guard response', async () => {
    requireMutableRequest.mockImplementation(() => {
      throw Response.json(
        {
          error: 'Read-only impersonation active',
          message: 'This session can view the app but cannot make changes.',
        },
        { status: 403 }
      );
    });

    const body = new FormData();
    body.set('response', 'Hello');
    body.set('cmsId', 'cms-1');

    let thrown: unknown;
    try {
      await action({
        request: new Request('https://example.com/api/domain/tutor-response', {
          method: 'POST',
          body,
          headers: { cookie: 'en_session=signed-cookie' },
        }),
      } as any);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(403);
  });

  test('sends the current document as explicit auditable tutor context', async () => {
    getLLMCompletion.mockResolvedValue('Draft a clearer thesis.');
    mockCms();
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      messages: [],
      assignmentModule: {
        instructions: [],
        assignmentType: { assignmentModules: [] },
      },
    });

    const body = new FormData();
    body.set('response', 'Can you review this?');
    body.set('cmsId', 'cms-1');
    body.set('content', 'Current draft');

    await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    const completionArgs = getLLMCompletion.mock.calls[0]?.[0] as any;
    expect(completionArgs.tools).toBeUndefined();
    expect(completionArgs.handleToolCall).toBeUndefined();
    expect(completionArgs.system).toContain('student_document_context');
    expect(completionArgs.system).toContain('Module rubric guidance');
    expect(completionArgs.system).toContain('Primary');
    expect(completionArgs.system).toContain('Thesis/Content (25%)');
    expect(completionArgs.system).not.toContain('Grammar/Syntax/Formatting');

    const documentContextMessage = completionArgs.messages.find(
      (message: { role: string; content: string }) =>
        message.role === 'user' &&
        message.content.includes('<student_document_context')
    );
    expect(documentContextMessage.content).toContain('source="client-content"');
    expect(documentContextMessage.content).toContain('Current draft');

    expect(completionArgs.metadata).toEqual(
      expect.objectContaining({
        feature: 'tutor',
        kind: 'assignment-module-tutor',
        documentId: 'doc-1',
        documentSource: 'client-content',
        documentTextLength: 'Current draft'.length,
        documentTextSha256: createHash('sha256')
          .update('Current draft')
          .digest('hex'),
        cmsId: 'cms-1',
        assignmentTypeId: 'assignment-type-1',
        assignmentTypeRubricSource: 'assignment-type',
        assignmentTypeGradingVersion: 7,
        rubricCategoryKeys: [
          'thesis_and_content',
          'grammar_and_mechanics',
        ],
        moduleRubricRelationships: {
          thesis_and_content: 'primary',
          grammar_and_mechanics: 'not-applicable',
        },
        instructionId: 'instruction-1',
      })
    );

    expect(prisma.assignmentModuleSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cms-1' },
        data: expect.objectContaining({
          updatedAt: expect.any(Date),
          messages: expect.any(Object),
        }),
      })
    );
  });

  test('never allows cross-provider fallback and never logs cleartext prompts for tutor calls', async () => {
    getLLMCompletion.mockResolvedValue('Draft a clearer thesis.');
    mockCms();
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      messages: [],
      assignmentModule: {
        instructions: [],
        assignmentType: { assignmentModules: [] },
      },
    });

    const body = new FormData();
    body.set('response', 'Can you review this?');
    body.set('cmsId', 'cms-1');
    body.set('content', 'Current draft');

    await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    const completionArgs = getLLMCompletion.mock.calls[0]?.[0] as any;
    expect(completionArgs.allowFallbackProvider).toBe(false);
    expect(completionArgs.logPayload).toBe('metadata-only');
  });

  test('an Anthropic outage is a plain failure, not a fallback-retry signal', async () => {
    // Cross-provider fallback is disabled for tutor (allowFallbackProvider:
    // false), so getLLMCompletion can never actually throw
    // LlmFallbackRetrySignal for this call site in production. This proves
    // the route no longer special-cases it into a 202 "retrying" response
    // even if it somehow received one - it's handled like any other failed
    // call, via the generic error response.
    mockCms();
    getLLMCompletion.mockImplementationOnce(() => {
      throw new LlmFallbackRetrySignal({
        reason: 'status:529',
        retryableStatus: 529,
        fallbackModel: 'gpt-4o-mini',
      });
    });

    const body = new FormData();
    body.set('response', 'Can you review this?');
    body.set('cmsId', 'cms-1');
    body.set('content', 'Current draft');

    const response = await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);
    const payload = response as {
      data: { retrying?: boolean; error?: string };
      init?: { status?: number };
    };

    expect(payload.init?.status).toBe(500);
    expect(payload.data.retrying).toBeUndefined();
    expect(payload.data.error).toContain('Failed to get a response');
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });

  test('no longer accepts an llmRetry field - there is nothing to retry onto', async () => {
    getLLMCompletion.mockResolvedValue('Draft a clearer thesis.');
    mockCms();
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      messages: [],
      assignmentModule: {
        instructions: [],
        assignmentType: { assignmentModules: [] },
      },
    });

    const body = new FormData();
    body.set('response', 'Can you review this?');
    body.set('cmsId', 'cms-1');
    body.set('content', 'Current draft');
    body.set('llmRetry', 'fallback');

    await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    expect(getLLMCompletion.mock.calls[0]?.[0].forceFallback).toBeUndefined();
    expect(
      getLLMCompletion.mock.calls[0]?.[0].signalFallbackRetry
    ).toBeUndefined();
    const createPayload =
      prisma.assignmentModuleSession.update.mock.calls[0]?.[0].data.messages
        .create;
    expect(createPayload).toHaveLength(2);
    expect(createPayload[0]).toMatchObject({
      agent: 'user',
      content: 'Can you review this?',
    });
    expect(createPayload[1]).toMatchObject({
      agent: 'assistant',
      content: 'Draft a clearer thesis.',
    });
  });
});
