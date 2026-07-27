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
const { buildApHistorySnapshot } = await import('~/domain/ap-history/schema');
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

  test('AP History sessions coach against the current section (module)', async () => {
    getLLMCompletion.mockResolvedValue('Which documents group together?');
    const apHistorySnapshot = buildApHistorySnapshot({
      externalKey: 'apush-dbq-new-deal-federal-power',
      course: 'apush',
      essayType: 'dbq',
      prompt:
        'Evaluate the extent to which the New Deal changed federal power.',
      period: '1932-1980',
      periodNumber: 7,
      reasoningSkill: 'causation',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 60,
      sources: [
        {
          externalKey: 'apush-dbq-new-deal-federal-power-doc-1',
          position: 1,
          title: 'Document 1',
          attribution: 'Franklin D. Roosevelt, first inaugural address, 1933',
          body: 'This Nation asks for action, and action now.',
          caption: null,
          mediaType: 'text',
          imageUrl: null,
          imageAlt: null,
          provenanceUrl: null,
        },
      ],
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      instructionsCompleted: 0,
      assignmentModule: {
        title: 'Read the Documents',
        tutorInstructions:
          'Coach source analysis and document groupings; hold off on drafting.',
        rubricAlignmentJson: null,
        assignmentType: {
          id: 'assignment-type-1',
          gradingAssistantVersion: 1,
          rubricJson: null,
        },
        instructions: [
          {
            id: 'instruction-1',
            title: 'Analyze the sources',
            tutorInstructions:
              'Build a working sense of each document before drafting.',
          },
        ],
      },
      messages: [],
      document: {
        id: 'doc-1',
        text: 'Original draft',
        apHistorySnapshot,
      },
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      messages: [],
      assignmentModule: {
        instructions: [],
        assignmentType: { assignmentModules: [] },
      },
    });

    const body = new FormData();
    body.set('response', 'Where do I start?');
    body.set('cmsId', 'cms-1');
    body.set('content', 'Current draft');

    await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    const completionArgs = getLLMCompletion.mock.calls[0]?.[0] as any;
    expect(completionArgs.system).toContain('DBQ Rubric (7 points');
    expect(completionArgs.system).toContain(
      'Current section: "Read the Documents"'
    );
    // The shared DB module stores a representative variant, but the route
    // selects the DBQ-specific section guidance for this DBQ document.
    expect(completionArgs.system).toContain('HIPP angle');
    expect(completionArgs.system).not.toContain('no documents on an LEQ');
    expect(completionArgs.system).toContain(
      'Current step: "Analyze the sources"'
    );
    // This step has no canonical step-level guidance, so the stored value is
    // used as a fallback.
    expect(completionArgs.system).toContain(
      'Build a working sense of each document before drafting.'
    );
    // The universal YAWP! Tutor character rides at the top of every AP History
    // prompt, and the section's register mode resolves from its title.
    expect(completionArgs.system).toContain('You are the YAWP! Tutor');
    expect(completionArgs.system).toContain(
      'REGISTER MODE FOR THIS MODULE: DRAFTING'
    );
    expect(completionArgs.system).not.toContain(
      'REGISTER MODE FOR THIS MODULE: POLISHED'
    );
  });

  test('AP History LEQ sessions get LEQ-specific section coaching, not the DBQ playbook', async () => {
    getLLMCompletion.mockResolvedValue('What evidence supports that claim?');
    const apHistorySnapshot = buildApHistorySnapshot({
      externalKey: 'apush-leq-market-revolution',
      course: 'apush',
      essayType: 'leq',
      prompt:
        'Evaluate the extent to which the Market Revolution transformed society.',
      period: '1815-1848',
      periodNumber: 4,
      reasoningSkill: 'causation',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 40,
      sources: [],
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      instructionsCompleted: 0,
      assignmentModule: {
        // The shared DB module stores the default (DBQ) variant; the route must
        // still coach this LEQ document with LEQ-specific guidance.
        title: 'Read the Documents',
        tutorInstructions:
          'Coach source analysis and document groupings; hold off on drafting.',
        rubricAlignmentJson: null,
        assignmentType: {
          id: 'assignment-type-1',
          gradingAssistantVersion: 1,
          rubricJson: null,
        },
        instructions: [
          {
            id: 'instruction-1',
            title: 'Analyze the sources',
            tutorInstructions: null,
          },
        ],
      },
      messages: [],
      document: {
        id: 'doc-1',
        text: 'Original draft',
        apHistorySnapshot,
      },
    });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      messages: [],
      assignmentModule: {
        instructions: [],
        assignmentType: { assignmentModules: [] },
      },
    });

    const body = new FormData();
    body.set('response', 'Where do I start?');
    body.set('cmsId', 'cms-1');
    body.set('content', 'Current draft');

    await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);

    const completionArgs = getLLMCompletion.mock.calls[0]?.[0] as any;
    expect(completionArgs.system).toContain('LEQ Rubric (6 points');
    expect(completionArgs.system).toContain(
      'Current section: "Read the Documents"'
    );
    // LEQ-specific guidance, not the DBQ document/HIPP playbook.
    expect(completionArgs.system).toContain('no documents on an LEQ');
    expect(completionArgs.system).not.toContain('HIPP angle');
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
});
