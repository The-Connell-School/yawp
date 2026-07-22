import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();
const requireMutableRequest = mock();
const requireUserId = mock();
const requireMembership = mock();
const prisma = {
  assignmentModuleSession: {
    findFirst: mock(),
    findUnique: mock(),
    update: mock(),
  },
  assignmentTypePromptVersion: {
    findFirst: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: {
    Assistant: 'assistant',
    User: 'user',
  },
  getLLMCompletion,
}));

const { LlmFallbackRetrySignal } =
  await import('~/utils/getLLMCompletion/llm-provider-errors.server');
const { action } = await import('./route');

describe('api.domain.tutor-response read-only impersonation', () => {
  beforeEach(() => {
    getLLMCompletion.mockReset();
    requireMutableRequest.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireMutableRequest.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
    prisma.assignmentTypePromptVersion.findFirst.mockReset();
    prisma.assignmentTypePromptVersion.findFirst.mockResolvedValue(null);
  });

  function mockCms(apHistorySnapshot?: unknown) {
    const cms = {
      id: 'cms-1',
      instructionsCompleted: 0,
      assignmentModule: {
        title: 'Drafting',
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
            title: 'Strengthen the Evidence',
            tutorInstructions: 'Focus on thesis clarity.',
          },
        ],
      },
      messages: [],
      document: {
        id: 'doc-1',
        text: 'Original draft',
        classAssignment: { class: { grade: '10th grade' } },
        membership: { grade: '10' },
        assignment: {
          tutorEnabled: true,
          prompt: 'Explain how the evidence supports the claim.',
          apHistorySnapshot,
          aiContextSnapshot: null,
        },
      },
    };
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce(cms);
    return cms;
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

    expect(prisma.assignmentModuleSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'cms-1',
          document: { membershipId: 'student-1' },
        },
      })
    );

    const completionArgs = getLLMCompletion.mock.calls[0]?.[0] as any;
    expect(completionArgs.tools).toBeUndefined();
    expect(completionArgs.handleToolCall).toBeUndefined();
    expect(completionArgs.system).toContain('student_document_context');
    expect(completionArgs.system).toContain('Module rubric guidance');
    expect(completionArgs.system).toContain('Primary');
    expect(completionArgs.system).toContain('Thesis/Content (25%)');
    expect(completionArgs.system).toContain('Grammar/Syntax/Formatting');
    expect(completionArgs.system).toContain(
      'Assignment prompt: Explain how the evidence supports the claim.'
    );
    expect(completionArgs.system).toContain('Rubric version: assignment-v7');
    expect(completionArgs.logPayload).toBe('metadata-only');

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
        rubricCategoryKeys: ['thesis_and_content', 'grammar_and_mechanics'],
        moduleRubricRelationships: {
          thesis_and_content: 'primary',
          grammar_and_mechanics: 'not-applicable',
        },
        instructionId: 'instruction-1',
        promptContentHash: expect.any(String),
        promptSource: 'canonical-runtime-v1',
        studentReadingLevel: '10th grade',
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

  test('returns a retry signal without writing messages when fallback retry is requested', async () => {
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
      data: { retrying?: boolean };
      init?: { status?: number };
    };

    expect(payload.init?.status).toBe(202);
    expect(payload.data.retrying).toBe(true);
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });

  test('forces fallback model on retry and persists one user and one tutor message', async () => {
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

    expect(getLLMCompletion.mock.calls[0]?.[0]).toMatchObject({
      forceFallback: true,
      signalFallbackRetry: false,
    });
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

  test('grounds APUSH coaching in the immutable snapshot and current section', async () => {
    const snapshot = {
      schemaVersion: 2,
      origin: 'library',
      libraryEntryId: 'apush-leq-market-revolution',
      course: 'apush',
      essayType: 'leq',
      prompt: 'Evaluate the causes of the Market Revolution.',
      period: '1800-1848',
      periodNumber: 4,
      reasoningSkill: 'causation',
      rubric: { rubricId: 'ap-history-leq-2026', totalPoints: 6 },
      timing: { mode: 'untimed', durationMinutes: 40 },
      sources: [],
    };
    getLLMCompletion.mockResolvedValue('Name one specific law or event.');
    mockCms(snapshot);
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      messages: [],
      assignmentModule: {
        instructions: [],
        assignmentType: { assignmentModules: [] },
      },
    });

    const body = new FormData();
    body.set('response', 'What evidence should I use?');
    body.set('cmsId', 'cms-1');
    await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    const completionArgs = getLLMCompletion.mock.calls[0]?.[0] as any;
    expect(completionArgs.system).toContain('LEQ Rubric (6 points');
    expect(completionArgs.system).toContain(snapshot.prompt);
    expect(completionArgs.system).toContain('Current section: "Drafting"');
    expect(completionArgs.system).toContain(
      'Current step: "Strengthen the Evidence"'
    );
    expect(completionArgs.system).toContain('specific named evidence');
    expect(completionArgs.system).not.toContain('Source documents (');
    expect(completionArgs.metadata).toMatchObject({
      assignmentTypeRubricSource: 'ap-history-snapshot',
      rubricCategoryKeys: [
        'thesis',
        'context',
        'evidence',
        'reasoning',
        'complexity',
      ],
    });
  });

  test('enforces an assignment tutor-off policy before calling the model', async () => {
    const cms = mockCms();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.findFirst.mockResolvedValue({
      ...cms,
      document: {
        ...cms.document,
        assignment: { tutorEnabled: false },
      },
    });

    const body = new FormData();
    body.set('response', 'Can you review this?');
    body.set('cmsId', 'cms-1');

    const response = await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    expect(response.init?.status).toBe(403);
    expect((response.data as { error?: string }).error).toBe(
      'Tutor is disabled for this assignment.'
    );
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });

  test('does not disclose another student session', async () => {
    prisma.assignmentModuleSession.findFirst.mockResolvedValue(null);
    const body = new FormData();
    body.set('response', 'Can you review this?');
    body.set('cmsId', 'other-student-cms');

    const response = await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });
});
