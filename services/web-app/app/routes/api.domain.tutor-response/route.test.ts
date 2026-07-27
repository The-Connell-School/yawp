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

const { buildApEnglishLangSnapshot } = await import(
  '~/domain/ap-english-lang/schema'
);

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

describe('AP English Language tutor', () => {
  beforeEach(() => {
    getLLMCompletion.mockReset();
    requireMutableRequest.mockReset();
    requireMutableRequest.mockResolvedValue(undefined);
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
  });

  function mockApLangCms(tutorInstructions: string | null) {
    const snapshot = buildApEnglishLangSnapshot({
      externalKey: 'ap-lang-synthesis-route',
      frqType: 'synthesis',
      title: 'Route demo',
      prompt: 'Take a position on school start times.',
      focusSkill: 'source-integration',
      difficulty: 'exam-ready',
      skillEmphasis: 'evidence-commentary',
      defaultTimeMode: 'untimed',
      defaultDurationMinutes: 40,
      suggestedEvidence: null,
      provenanceUrl: null,
      sources: [1, 2, 3, 4, 5, 6].map((position) => ({
        externalKey: `route-source-${position}`,
        position,
        title: `Source ${String.fromCharCode(64 + position)}`,
        attribution: 'Practice source',
        body: `Body of source ${position}.`,
        caption: null,
        mediaType: position === 6 ? 'image' : 'text',
        imageUrl: position === 6 ? '/img/chart.png' : null,
        imageAlt: position === 6 ? 'A chart' : null,
        provenanceUrl: null,
      })),
    });

    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      instructionsCompleted: 0,
      assignmentModule: {
        tutorInstructions,
        rubricAlignmentJson: null,
        assignmentType: {
          id: 'ap-lang-type',
          gradingAssistantVersion: 1,
          rubricJson: null,
        },
        instructions: [{ id: 'instruction-1', tutorInstructions: null }],
      },
      messages: [],
      document: {
        id: 'doc-1',
        text: 'Original draft',
        assignment: { apEnglishLangSnapshot: snapshot },
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
  }

  async function runTutor() {
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

    return (getLLMCompletion.mock.calls[0]?.[0] as any).system as string;
  }

  test('an unseeded module still gets the full authored coach, not an empty prompt', async () => {
    // Before this wiring the AP Lang tutor ran with no instructions at all:
    // the module carries no tutorInstructions and nothing called the coach.
    getLLMCompletion.mockResolvedValue('What does that source do for you?');
    mockApLangCms(null);

    const system = await runTutor();

    expect(system).toContain('You are the YAWP! Tutor');
    expect(system).toContain('AP ENGLISH LANGUAGE');
    expect(system).toContain('Coaching principles');
    expect(system).toContain('REGISTER MODE FOR THIS MODULE: POLISHED');
    // and the assignment-specific half comes from the snapshot
    expect(system).toContain('school start times');
    expect(system).toContain('synthesis question (Q1)');
    expect(system).toContain('40-minute budget');
  });

  test('a coaching block edited in admin replaces the authored default', async () => {
    getLLMCompletion.mockResolvedValue('What does that source do for you?');
    mockApLangCms('EDITED IN ADMIN. Coach tersely.');

    const system = await runTutor();

    expect(system).toContain('EDITED IN ADMIN. Coach tersely.');
    expect(system).not.toContain('You are the YAWP! Tutor');
    expect(system).toContain('school start times');
  });
});
