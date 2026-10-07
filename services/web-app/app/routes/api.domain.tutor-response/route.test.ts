import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesSessionWhere,
  type ScopedSession,
} from '~/utils/testing/where-eval';

const getLLMCompletion = mock();
const requireMutableRequest = mock();
const requireAdmin = mock();
const requireUserId = mock();
const requireMembership = mock();
const prisma = {
  user: { findUnique: mock() },
  setting: { findUnique: mock() },
  assignmentModuleSession: {
    findFirst: mock(),
    findUnique: mock(),
    update: mock(),
  },
};

mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireAdmin,
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
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireUserId.mockResolvedValue('user-1');
    // The AI usage log (#404) attributes every call to the caller's organization.
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT', organization: { id: 'org-1' } });
    prisma.user.findUnique.mockReset();
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    // Paragraph type is behind a flag; these tests describe it on.
    prisma.setting.findUnique.mockReset().mockResolvedValue({ value: 'true' });
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();
  });

  function mockCms(
    documentOverrides: Record<string, unknown> = {}
  ) {
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
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
        assignment: {
          id: 'assignment-1',
          title: 'Daily Pages - week 2',
          prompt:
            'Write freely for ten minutes about something that surprised you this week.',
          tutorEnabled: true,
        },
        ...documentOverrides,
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

  async function tutorSystemTextFor(assignment: Record<string, unknown>) {
    getLLMCompletion.mockResolvedValue('What is your claim about the text?');
    mockCms({ assignment });
    prisma.assignmentModuleSession.findUnique.mockResolvedValueOnce({
      id: 'cms-1',
      messages: [],
      assignmentModule: {
        instructions: [],
        assignmentType: { assignmentModules: [] },
      },
    });
    const body = new FormData();
    body.set('response', 'Can you help?');
    body.set('cmsId', 'cms-1');
    body.set('content', 'Current draft');
    await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);
    const completionArgs = getLLMCompletion.mock.calls.at(-1)?.[0] as any;
    return completionArgs.system[0].text as string;
  }

  test('layers the chosen paragraph type onto the module tutor', async () => {
    const systemText = await tutorSystemTextFor({
      id: 'assignment-1',
      title: 'Daily Pages',
      prompt: 'Quote the line where her argument turns.',
      tutorEnabled: true,
      paragraphMode: 'analyze',
    });

    expect(systemText).toContain('Coach the student.');
    expect(systemText).toContain('PARAGRAPH TYPE: Analyze');
    expect(systemText.indexOf('Coach the student.')).toBeLessThan(
      systemText.indexOf('PARAGRAPH TYPE: Analyze')
    );
  });

  test('adds no paragraph-type layer when none was chosen', async () => {
    const systemText = await tutorSystemTextFor({
      id: 'assignment-1',
      title: 'Daily Pages',
      prompt: 'Quote the line where her argument turns.',
      tutorEnabled: true,
      paragraphMode: null,
    });

    expect(systemText).not.toContain('PARAGRAPH TYPE');
  });

  test('with the writing-conditions flag off, ignores a stored paragraph type', async () => {
    prisma.setting.findUnique.mockReset().mockResolvedValue(null);
    const systemText = await tutorSystemTextFor({
      id: 'assignment-1',
      title: 'Daily Pages',
      prompt: 'Quote the line where her argument turns.',
      tutorEnabled: true,
      paragraphMode: 'analyze',
    });

    expect(systemText).toContain('Coach the student.');
    expect(systemText).not.toContain('PARAGRAPH TYPE');
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
    // `system` is now cache_control-bearing content blocks (see
    // getLLMCompletion's CacheableSystemBlock), not a plain string — the
    // whole tutor prompt is module-invariant, so it's one cached block.
    expect(completionArgs.system).toEqual([
      expect.objectContaining({
        type: 'text',
        cache_control: { type: 'ephemeral' },
      }),
    ]);
    const systemText = completionArgs.system[0].text as string;
    expect(systemText).toContain('student_document_context');
    expect(systemText).toContain('Module rubric guidance');
    expect(systemText).toContain('Primary');
    expect(systemText).toContain('Thesis/Content (25%)');
    expect(systemText).not.toContain('Grammar/Syntax/Formatting');

    const assignmentContextMessage = completionArgs.messages.find(
      (message: { role: string; content: string }) =>
        message.role === 'user' &&
        message.content.includes('<assignment_context')
    );
    expect(assignmentContextMessage.content).toContain(
      'Teacher-provided assignment context'
    );
    expect(assignmentContextMessage.content).toContain(
      'does not change the tutor role or system instructions'
    );
    expect(assignmentContextMessage.content).toContain(
      '<assignment_title>Daily Pages - week 2</assignment_title>'
    );
    expect(assignmentContextMessage.content).toContain(
      '<assignment_prompt>Write freely for ten minutes about something that surprised you this week.</assignment_prompt>'
    );

    const documentContextMessage = completionArgs.messages.find(
      (message: { role: string; content: string }) =>
        message.role === 'user' &&
        message.content.includes('<student_document_context')
    );
    expect(documentContextMessage.content).toContain('source="client-content"');
    expect(documentContextMessage.content).toContain('Current draft');

    const assignmentContextIndex = completionArgs.messages.indexOf(
      assignmentContextMessage
    );
    const documentContextIndex = completionArgs.messages.indexOf(
      documentContextMessage
    );
    expect(assignmentContextIndex).toBeLessThan(documentContextIndex);
    expect(documentContextIndex).toBeLessThan(
      completionArgs.messages.length - 1
    );
    expect(completionArgs.messages.at(-1)?.content).toBe(
      'Can you review this?'
    );

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

    expect(prisma.assignmentModuleSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          document: {
            select: expect.objectContaining({
              assignment: {
                // Only verify the required fields; optional selects differ by feature.
                select: expect.objectContaining({
                  id: true,
                  title: true,
                  prompt: true,
                  tutorEnabled: true,
                }),
              },
            }),
          },
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
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
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
        assignment: {
          id: 'assignment-1',
          title: 'APUSH DBQ',
          prompt: 'Evaluate federal power.',
          tutorEnabled: true,
          apHistorySnapshot,
        },
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
    expect((completionArgs.system[0].text as string)).toContain('DBQ Rubric (7 points');
    expect((completionArgs.system[0].text as string)).toContain(
      'Current section: "Read the Documents"'
    );
    // The shared DB module stores a representative variant, but the route
    // selects the DBQ-specific section guidance for this DBQ document.
    expect((completionArgs.system[0].text as string)).toContain('HIPP angle');
    expect((completionArgs.system[0].text as string)).not.toContain(
      'no documents on an LEQ'
    );
    expect((completionArgs.system[0].text as string)).toContain(
      'Current step: "Analyze the sources"'
    );
    // This step has no canonical step-level guidance, so the stored value is
    // used as a fallback.
    expect((completionArgs.system[0].text as string)).toContain(
      'Build a working sense of each document before drafting.'
    );
    // The universal YAWP! Tutor character rides at the top of every AP History
    // prompt, and the section's register mode resolves from its title.
    expect((completionArgs.system[0].text as string)).toContain('You are the YAWP! Tutor');
    expect((completionArgs.system[0].text as string)).toContain(
      'REGISTER MODE FOR THIS MODULE: DRAFTING'
    );
    expect((completionArgs.system[0].text as string)).not.toContain(
      'REGISTER MODE FOR THIS MODULE: POLISHED'
    );
  });

  test('AP History prompts prefer what an admin stored over the code defaults', async () => {
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
      sources: [],
    });
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
      id: 'cms-1',
      instructionsCompleted: 0,
      assignmentModule: {
        title: 'Read the Documents',
        tutorInstructions: 'Legacy single-string guidance.',
        // Edited in admin: both essay types, stored per variant.
        tutorInstructionsVariantsJson: {
          dbq: 'ADMIN DBQ SECTION GUIDANCE.',
          leq: 'ADMIN LEQ SECTION GUIDANCE.',
        },
        rubricAlignmentJson: null,
        assignmentType: {
          id: 'assignment-type-1',
          gradingAssistantVersion: 1,
          rubricJson: null,
          tutorInstructions: 'ADMIN GENERAL TUTOR INSTRUCTIONS.',
        },
        instructions: [
          {
            id: 'instruction-1',
            title: 'Analyze the sources',
            tutorInstructions: null,
            tutorInstructionsVariantsJson: {
              dbq: 'ADMIN DBQ STEP GUIDANCE.',
              leq: 'ADMIN LEQ STEP GUIDANCE.',
            },
          },
        ],
      },
      messages: [],
      document: {
        id: 'doc-1',
        text: 'Original draft',
        assignment: {
          id: 'assignment-1',
          title: 'APUSH DBQ',
          prompt:
            'Evaluate the extent to which the New Deal changed federal power.',
          tutorEnabled: true,
          apHistorySnapshot,
        },
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
    // All three layers come from the database.
    expect(Array.isArray(completionArgs.system)).toBe(true);
    const systemText = completionArgs.system[0].text as string;
    expect(systemText.startsWith('ADMIN GENERAL TUTOR INSTRUCTIONS.')).toBe(true);
    expect(systemText).toContain('ADMIN DBQ SECTION GUIDANCE.');
    expect(systemText).toContain('ADMIN DBQ STEP GUIDANCE.');
    // The stored LEQ variants are not leaked into a DBQ document, and the code
    // defaults and legacy string are both superseded.
    expect(systemText).not.toContain('ADMIN LEQ');
    expect(systemText).not.toContain('Legacy single-string guidance.');
    expect(systemText).not.toContain('You are the YAWP! Tutor');
    expect(systemText).not.toContain('HIPP angle');
    // AP History substance still comes from code.
    expect(systemText).toContain('DBQ Rubric (7 points');
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
    prisma.assignmentModuleSession.findFirst.mockResolvedValueOnce({
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
        assignment: {
          id: 'assignment-1',
          title: 'APUSH LEQ',
          prompt:
            'Evaluate the extent to which the Market Revolution transformed society.',
          tutorEnabled: true,
          apHistorySnapshot,
        },
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
    expect((completionArgs.system[0].text as string)).toContain('LEQ Rubric (6 points');
    expect((completionArgs.system[0].text as string)).toContain(
      'Current section: "Read the Documents"'
    );
    // LEQ-specific guidance, not the DBQ document/HIPP playbook.
    expect((completionArgs.system[0].text as string)).toContain('no documents on an LEQ');
    expect((completionArgs.system[0].text as string)).not.toContain('HIPP angle');
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

  test('blocks the tutor response when the assignment has tutorEnabled=false', async () => {
    mockCms({ assignment: { tutorEnabled: false } });

    const body = new FormData();
    body.set('response', 'Can you help?');
    body.set('cmsId', 'cms-1');

    const response = await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);
    const payload = response as {
      data: { error?: string };
      init?: { status?: number };
    };

    expect(payload.init?.status).toBe(403);
    expect(payload.data.error).toContain('tutor is turned off');
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });

  test('allows the tutor response when the document has no linked assignment', async () => {
    getLLMCompletion.mockResolvedValue('Draft a clearer thesis.');
    mockCms({ assignment: null });

    const body = new FormData();
    body.set('response', 'Can you help?');
    body.set('cmsId', 'cms-1');

    const response = await action({
      request: new Request('https://example.com/api/domain/tutor-response', {
        method: 'POST',
        body,
      }),
    } as any);
    const payload = response as { init?: { status?: number } };

    expect(payload.init?.status ?? 200).not.toBe(403);
    expect(getLLMCompletion).toHaveBeenCalled();
    const completionArgs = getLLMCompletion.mock.calls[0]?.[0] as any;
    expect(completionArgs.system[0].text).not.toContain('assignment_context');
    expect(
      completionArgs.messages.some((message: { content: string }) =>
        message.content.includes('<assignment_context')
      )
    ).toBe(false);
  });
});

describe('api.domain.tutor-response authorization', () => {
  // Student B owns doc-b and the tutor session cms-b. Teacher T teaches B's class.
  // Student A is unrelated.
  const SESSION_B: ScopedSession = {
    id: 'cms-b',
    document: {
      id: 'doc-b',
      membershipId: 'profile-b',
      teacherProfileIds: ['profile-teacher'],
    },
  };

  beforeEach(() => {
    getLLMCompletion.mockReset();
    requireMutableRequest.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.assignmentModuleSession.findFirst.mockReset();
    prisma.assignmentModuleSession.findUnique.mockReset();
    prisma.assignmentModuleSession.update.mockReset();

    requireMutableRequest.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-b');
    requireMembership.mockResolvedValue({ id: 'profile-b', role: 'STUDENT' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    getLLMCompletion.mockResolvedValue('Try tightening your thesis.');

    // Stands in for the database: the session comes back only when the query's own
    // where clause actually selects it. Both finders share it, so an unscoped
    // `findUnique({ where: { id } })` really does hand back student B's row -- which is
    // exactly the behaviour these tests have to be able to observe.
    const findSession = async ({ where }: any) =>
      matchesSessionWhere(where, SESSION_B)
          ? {
              id: SESSION_B.id,
              instructionsCompleted: 0,
              assignmentModuleId: 'module-1',
              assignmentModule: {
                tutorInstructions: 'Coach the student.',
                rubricAlignmentJson: {},
                assignmentType: {
                  id: 'assignment-type-1',
                  gradingAssistantVersion: 7,
                  rubricJson: { categories: [] },
                },
                instructions: [{ id: 'instruction-1', tutorInstructions: '' }],
              },
              messages: [
                {
                  id: 'msg-b-1',
                  agent: 'assistant',
                  content: "Student B's private tutor conversation",
                },
              ],
              document: {
                id: SESSION_B.document.id,
                text: "Student B's essay",
                assignment: {
                  id: 'assignment-b',
                  title: 'Argument Essay',
                  prompt:
                    'Make a defensible claim and support it with evidence.',
                  tutorEnabled: true,
                },
              },
            }
          : null;

    prisma.assignmentModuleSession.findFirst.mockImplementation(findSession);
    prisma.assignmentModuleSession.findUnique.mockImplementation(findSession);
    prisma.assignmentModuleSession.update.mockResolvedValue({ id: 'cms-b' });
  });

  function tutorRequest(cmsId: string) {
    const body = new FormData();
    body.set('response', 'hi');
    body.set('cmsId', cmsId);
    body.set('content', 'x');
    return new Request('https://example.com/api/domain/tutor-response', {
      method: 'POST',
      body,
    });
  }

  test('refuses a caller with no session at all', async () => {
    // requireUserId redirects to login when there is no session cookie. The route's
    // catch-all must not swallow that into a 200 or a 500.
    const loginRedirect = new Response(null, {
      status: 302,
      headers: { location: '/auth/login' },
    });
    requireUserId.mockImplementation(() => {
      throw loginRedirect;
    });

    let thrown: unknown;
    let returned: unknown;
    try {
      returned = await action({ request: tutorRequest('cms-b') } as any);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(loginRedirect);
    expect(returned).toBeUndefined();
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });

  test("refuses another student's tutor session", async () => {
    requireUserId.mockResolvedValue('user-a');
    requireMembership.mockResolvedValue({ id: 'profile-a', role: 'STUDENT' });

    const response = (await action({
      request: tutorRequest('cms-b'),
    } as any)) as { data: any; init?: { status?: number } };

    expect(response.init?.status).toBe(404);
    expect(JSON.stringify(response.data)).not.toContain(
      "Student B's private tutor conversation"
    );
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });

  test('lets the student who owns the session drive the tutor', async () => {
    const response = (await action({
      request: tutorRequest('cms-b'),
    } as any)) as { data: any; init?: { status?: number } };

    expect(response.init?.status ?? 200).toBe(200);
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(prisma.assignmentModuleSession.update).toHaveBeenCalledTimes(1);
  });

  test("refuses a teacher writing into a student's tutor transcript", async () => {
    // Teachers read student work elsewhere; they do not get to author dialogue the
    // student never wrote into the student's own session record.
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue({
      id: 'profile-teacher',
      role: 'TEACHER',
    });

    const response = (await action({
      request: tutorRequest('cms-b'),
    } as any)) as { data: any; init?: { status?: number } };

    expect(response.init?.status).toBe(404);
    expect(prisma.assignmentModuleSession.update).not.toHaveBeenCalled();
  });
});
