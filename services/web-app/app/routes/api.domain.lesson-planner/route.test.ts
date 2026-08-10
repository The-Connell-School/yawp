import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();
const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const handleLessonPlannerToolCall = mock();
const reserveAiRequest = mock();
class AiRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('rate limited');
  }
}

const prisma = {
  lessonPlanConversation: {
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
  lessonPlanMessage: {
    create: mock(),
    findFirst: mock(),
  },
  classAssignment: {
    findFirst: mock(),
  },
  $transaction: mock(),
};

// Process-wide module mock: keep the other auth.server exports the sibling
// lesson-planner tests rely on, whichever file happens to load first.
mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireUserId: mock(),
  requireMembership: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess,
}));
mock.module('~/domain/lesson-planner/lesson-planner-tools.server', () => ({
  handleLessonPlannerToolCall,
  LESSON_PLANNER_TOOLS: [{ name: 'list_classes' }],
}));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));
mock.module('~/utils/ai-admission.server', () => ({
  AiRateLimitError,
  reserveAiRequest,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function formRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request('http://localhost/api/domain/lesson-planner', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

const access = {
  userId: 'user-1',
  membership: {
    id: 'teacher-1',
    role: 'TEACHER',
    isOrgOwner: false,
    organization: { id: 'org-1', name: 'Test Org' },
  },
  isTeacher: true,
  enabled: true,
  allowed: true,
};

beforeEach(() => {
  getLLMCompletion.mockReset();
  requireMutableRequest.mockReset().mockResolvedValue(undefined);
  requireLessonPlannerAccess.mockReset().mockResolvedValue(access);
  handleLessonPlannerToolCall.mockReset();
  reserveAiRequest.mockReset().mockResolvedValue(undefined);
  prisma.lessonPlanConversation.findFirst.mockReset();
  prisma.lessonPlanConversation.create.mockReset();
  prisma.lessonPlanConversation.update.mockReset();
  prisma.lessonPlanMessage.create
    .mockReset()
    .mockResolvedValue({ id: 'msg-assistant' });
  prisma.lessonPlanMessage.findFirst.mockReset().mockResolvedValue(null);
  prisma.classAssignment.findFirst.mockReset().mockResolvedValue(null);
  prisma.$transaction.mockReset();
  prisma.$transaction.mockImplementation(
    async (callback: (client: typeof prisma) => unknown) => callback(prisma)
  );
});

describe('api.domain.lesson-planner action', () => {
  test('creates a conversation and persists both turns on first message', async () => {
    getLLMCompletion.mockResolvedValue('Here is your lesson.');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'Lesson on conclusion paragraphs' }),
    } as any);
    const body = (await response.data) as any;

    expect(body.conversationId).toBe('plan-1');
    expect(body.reply).toBe('Here is your lesson.');
    expect(body.isNewConversation).toBe(true);

    const createArg =
      prisma.lessonPlanConversation.create.mock.calls[0][0].data;
    expect(createArg.membershipId).toBe('teacher-1');
    expect(createArg.organizationId).toBe('org-1');
    expect(createArg.title).toBe('Lesson on conclusion paragraphs');

    const created = prisma.lessonPlanMessage.create.mock.calls.map(
      (call: any) => call[0].data
    );
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      role: 'user',
      content: 'Lesson on conclusion paragraphs',
    });
    expect(created[1]).toMatchObject({
      role: 'assistant',
      content: 'Here is your lesson.',
    });
    // Explicit, strictly-increasing timestamps: the DB default would tie two
    // rows written in the same transaction and leave replay order ambiguous.
    expect(created[1].createdAt.getTime()).toBeGreaterThan(
      created[0].createdAt.getTime()
    );
  });

  test('returns the reply id so it can be kept without a reload', async () => {
    getLLMCompletion.mockResolvedValue('Here is your lesson.');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'hi' }),
    } as any);

    expect((response.data as any).messageId).toBe('msg-assistant');
  });

  test('passes the planner tool allowlist and a teacher-scoped context to the LLM', async () => {
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({ request: formRequest({ message: 'hi' }) } as any);

    const llmArgs = getLLMCompletion.mock.calls[0][0];
    expect(llmArgs.tools).toEqual([{ name: 'list_classes' }]);
    expect(llmArgs.metadata.feature).toBe('lesson-planner');
    expect(llmArgs.logPayload).toBe('metadata-only');
    expect(llmArgs.allowFallbackProvider).toBe(false);
    expect(llmArgs.signal).toBeInstanceOf(AbortSignal);
    // Room to walk the catalog: class report, a Daily Pages search, a writing
    // lesson lookup, and the Lounge can all be needed for one plan.
    expect(llmArgs.maxToolRounds).toBeGreaterThanOrEqual(8);
    // Lessons now quote real lesson text and speaker notes; a tight ceiling
    // truncates mid-handout, which reads to a teacher as bad material.
    expect(llmArgs.maxTokens).toBeGreaterThanOrEqual(8_000);

    llmArgs.handleToolCall('list_classes', { a: 1 });
    expect(handleLessonPlannerToolCall).toHaveBeenCalledWith(
      'list_classes',
      { a: 1 },
      { membershipId: 'teacher-1', organizationId: 'org-1' }
    );
  });

  test('reserves admission under its own feature budget', async () => {
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({ request: formRequest({ message: 'hi' }) } as any);

    expect(reserveAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipId: 'teacher-1',
        organizationId: 'org-1',
        feature: 'lesson-planner',
      })
    );
  });

  test('continues an existing conversation with prior messages', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: [
        { role: 'assistant', content: 'earlier plan' },
        { role: 'user', content: 'earlier ask' },
      ],
    });
    getLLMCompletion.mockResolvedValue('follow-up plan');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({
        message: 'now make the deck',
        conversationId: 'plan-9',
      }),
    } as any);
    const body = (await response.data) as any;

    expect(body.isNewConversation).toBe(false);
    expect(prisma.lessonPlanConversation.create).not.toHaveBeenCalled();
    const llmMessages = getLLMCompletion.mock.calls[0][0].messages;
    expect(llmMessages).toHaveLength(3);
    expect(llmMessages[0]).toMatchObject({
      role: 'user',
      content: 'earlier ask',
    });
    expect(llmMessages[2]).toMatchObject({
      role: 'user',
      content: 'now make the deck',
    });

    const findArg = prisma.lessonPlanConversation.findFirst.mock.calls[0][0];
    expect(findArg.where).toMatchObject({
      id: 'plan-9',
      membershipId: 'teacher-1',
      deletedAt: null,
    });
    expect(findArg.include.messages).toMatchObject({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  });

  test('bounds long histories by character count before calling the model', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 ? 'user' : 'assistant',
        content: `${index}-${'x'.repeat(2_000)}`,
      })),
    });
    getLLMCompletion.mockResolvedValue('bounded');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({ message: 'new', conversationId: 'plan-9' }),
    } as any);

    const llmMessages = getLLMCompletion.mock.calls[0][0].messages;
    expect(llmMessages.length).toBeLessThan(21);
    expect(
      llmMessages.reduce(
        (total: number, message: { content: string }) =>
          total + message.content.length,
        0
      )
    ).toBeLessThanOrEqual(24_003);
    expect(llmMessages.at(-1)).toMatchObject({ role: 'user', content: 'new' });
  });

  test('records the Class Summary next step a session was opened from', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({ message: 'hi', originClassAssignmentId: 'ca-1' }),
    } as any);

    // The origin is only trusted after it is re-checked against the teacher's
    // own classes.
    expect(
      prisma.classAssignment.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      id: 'ca-1',
      class: { teachers: { some: { id: 'teacher-1' } } },
    });
    expect(
      prisma.lessonPlanConversation.create.mock.calls[0][0].data
        .originClassAssignmentId
    ).toBe('ca-1');
  });

  test('drops an origin that does not belong to the teacher', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({
        message: 'hi',
        originClassAssignmentId: 'someone-elses',
      }),
    } as any);

    expect(
      prisma.lessonPlanConversation.create.mock.calls[0][0].data
        .originClassAssignmentId
    ).toBeNull();
  });

  test('rejects oversized messages before calling the model', async () => {
    const response = await action({
      request: formRequest({ message: 'x'.repeat(6_001) }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rate-limits rapid planner requests per teacher', async () => {
    reserveAiRequest.mockRejectedValueOnce(new AiRateLimitError(60));

    const response = await action({
      request: formRequest({ message: 'one more' }),
    } as any);

    expect(response.init?.status).toBe(429);
    expect(response.init?.headers).toMatchObject({ 'Retry-After': '60' });
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('does not expose provider errors to the client', async () => {
    getLLMCompletion.mockRejectedValue(
      new Error('provider-secret request identifier')
    );

    const response = await action({
      request: formRequest({ message: 'hi' }),
    } as any);

    expect(response.init?.status).toBe(500);
    expect(JSON.stringify(response.data)).not.toContain('provider-secret');
    expect(prisma.lessonPlanConversation.create).not.toHaveBeenCalled();
  });

  test('never accepts a client request to transfer planner data to fallback', async () => {
    const response = await action({
      request: formRequest({ message: 'hi', llmRetry: 'fallback' }),
    } as any);

    expect(response.init?.status).toBe(422);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('tells the model which of its past decks never rendered', async () => {
    const stale = `Here's the deck.\n\n\`\`\`yawp-slides\n${JSON.stringify({
      title: 'Deck',
      slides: [{ layout: 'bullets', title: 'Nothing' }],
    })}\n\`\`\``;
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: [{ role: 'assistant', content: stale }],
    });
    getLLMCompletion.mockResolvedValue('Rebuilding it now.');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({
        message: 'the slides are not working',
        conversationId: 'plan-9',
      }),
    } as any);

    const [replayed] = getLLMCompletion.mock.calls[0][0].messages;
    // Otherwise it reads its own JSON, decides the deck shipped, and tells the
    // teacher to scroll down and look for it.
    expect(replayed.content).not.toContain('"slides"');
    expect(replayed.content).toContain('failed validation');
    expect(replayed.content).toContain("Here's the deck.");
  });

  test('gives a rejected slide deck one repair pass before storing it', async () => {
    const broken = {
      title: 'Conclusions',
      slides: [{ layout: 'bullets', title: 'What a conclusion does' }],
    };
    const fixed = {
      title: 'Conclusions',
      slides: [
        {
          layout: 'bullets',
          title: 'What a conclusion does',
          bullets: ['Answers "so what?"'],
          speakerNotes: 'Ask for their last sentences first.',
        },
      ],
    };
    getLLMCompletion
      .mockResolvedValueOnce(
        `Here's the lesson.\n\n\`\`\`yawp-slides\n${JSON.stringify(
          broken
        )}\n\`\`\``
      )
      .mockResolvedValueOnce(JSON.stringify(fixed));
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'make me a deck' }),
    } as any);
    const body = (await response.data) as any;

    expect(getLLMCompletion).toHaveBeenCalledTimes(2);
    // The repair pass is a plain completion — no tools, no catalog rounds.
    const repairArgs = getLLMCompletion.mock.calls[1][0];
    expect(repairArgs.tools).toBeUndefined();
    expect(repairArgs.messages[0].content).toContain('speakerNotes');
    // The reason is schema vocabulary, so it is safe to keep in the log even
    // though planner payloads are redacted.
    expect(repairArgs.metadata.deckFailure).toContain('slides.0.speakerNotes');

    expect(body.reply).toContain('Ask for their last sentences first.');
    const stored = prisma.lessonPlanMessage.create.mock.calls[1][0].data;
    expect(stored.content).toContain('Ask for their last sentences first.');
  });

  test('does not spend a repair pass on a deck that already validates', async () => {
    getLLMCompletion.mockResolvedValue(
      `Deck below.\n\n\`\`\`yawp-slides\n${JSON.stringify({
        title: 'Deck',
        slides: [
          { layout: 'statement', title: 'A', body: 'B', speakerNotes: 'C' },
        ],
      })}\n\`\`\``
    );
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({ request: formRequest({ message: 'deck please' }) } as any);

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
  });

  test('still delivers the lesson when the repair pass fails', async () => {
    const reply = `Here's the lesson.\n\n\`\`\`yawp-slides\n${JSON.stringify({
      title: 'Deck',
      slides: [{ layout: 'bullets', title: 'Nothing' }],
    })}\n\`\`\``;
    getLLMCompletion
      .mockResolvedValueOnce(reply)
      .mockRejectedValueOnce(new Error('provider-secret timeout'));
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'deck please' }),
    } as any);

    expect(response.init?.status).toBeUndefined();
    expect((response.data as any).reply).toBe(reply);
  });

  test('strips a link the catalog never handed back', async () => {
    // The planner invents Lounge material that sounds entirely real, and the
    // teacher finds out it goes nowhere in front of a class.
    handleLessonPlannerToolCall.mockResolvedValue(
      JSON.stringify({
        trainings: [
          { title: 'Body Paragraphs', href: '/app/teacher-trainings/t1' },
        ],
      })
    );
    getLLMCompletion.mockImplementation(async ({ handleToolCall }: any) => {
      if (handleToolCall) await handleToolCall('list_lounge_materials', {});
      return (
        'Project [Body Paragraphs](/app/teacher-trainings/t1) for the mini-lesson.\n' +
        'Hand out [Citing & Integrating Quotations](/app/resources/citing).'
      );
    });
    prisma.lessonPlanConversation.create.mockResolvedValue({
      id: 'plan-1',
      messages: [],
    });
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    const response = await action({
      request: formRequest({ message: 'plan a lesson' }),
    } as any);

    const expected =
      'Project [Body Paragraphs](/app/teacher-trainings/t1) for the mini-lesson.\n' +
      'Hand out Citing & Integrating Quotations.';
    expect((response.data as any).reply).toBe(expected);
    // The dead link never enters the conversation's history either.
    const stored = prisma.lessonPlanMessage.create.mock.calls.map(
      (call: any) => call[0].data
    );
    expect(stored[1].content).toBe(expected);
  });

  test('returns 404 when a conversationId does not belong to the teacher', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);

    const response = await action({
      request: formRequest({ message: 'hi', conversationId: 'not-mine' }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(reserveAiRequest).not.toHaveBeenCalled();
  });
});

describe('api.domain.lesson-planner action — building one day of a unit', () => {
  const unitBlock = [
    '```yawp-unit',
    JSON.stringify({
      title: 'Writing the literary analysis paragraph',
      endsWith: 'One analysis paragraph on a passage they choose',
      days: [
        {
          day: 1,
          title: 'What a claim is',
          objective: 'Tell a claim apart from a summary',
          students: 'Sort ten sentences',
          buildsTo: 'They need a claim before they can support one',
        },
        {
          day: 2,
          title: 'Evidence that earns its place',
          objective: 'Choose the quote that proves the claim',
          students: 'Match claims to the strongest of three quotes',
          minutes: 50,
        },
      ],
    }),
    '```',
  ].join('\n');

  test('looks up the map and hands the day’s context to the model', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: [
        { role: 'assistant', content: `Here is the arc.\n\n${unitBlock}` },
      ],
      materials: [],
    });
    prisma.lessonPlanMessage.findFirst.mockResolvedValue({
      content: `Here is the arc.\n\n${unitBlock}`,
    });
    getLLMCompletion.mockResolvedValue(
      '## Evidence that earns its place\n\nHere is the lesson.'
    );
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({
        message:
          'Build day 2 of "Writing the literary analysis paragraph" in full: Evidence that earns its place. The objective is: Choose the quote that proves the claim Students: Match claims to the strongest of three quotes I have 50 minutes. Keep it inside the arc of the unit — this day comes after day 1 and has to set up what follows.',
        conversationId: 'plan-9',
      }),
    } as any);

    expect(prisma.lessonPlanMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: 'plan-9',
          role: 'assistant',
          content: { contains: '```yawp-unit' },
        }),
      })
    );

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    const lower = system.toLowerCase();
    expect(lower).toContain('day 2 of 2');
    expect(lower).toContain('choose the quote that proves the claim');
    // The day before's own ending, so day 2 is not planned in a vacuum.
    expect(lower).toContain('they need a claim before they can support one');
  });

  test('does not query for a map on an ordinary message', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: [],
      materials: [],
    });
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({
        message: 'What should the warm-up be?',
        conversationId: 'plan-9',
      }),
    } as any);

    expect(prisma.lessonPlanMessage.findFirst).not.toHaveBeenCalled();
  });

  test('adds no unit context when the button’s day is not in the map', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: [],
      materials: [],
    });
    prisma.lessonPlanMessage.findFirst.mockResolvedValue({
      content: `Here is the arc.\n\n${unitBlock}`,
    });
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({
        message: 'Build day 9 of "Some other unit" in full: Nothing.',
        conversationId: 'plan-9',
      }),
    } as any);

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    expect(system.toLowerCase()).not.toContain(
      'building one day out of a unit'
    );
  });

  test('does not mistake a teacher’s own message for the button', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-9',
      messages: [],
      materials: [],
    });
    getLLMCompletion.mockResolvedValue('ok');
    prisma.lessonPlanConversation.update.mockResolvedValue({});

    await action({
      request: formRequest({
        message: 'Can you build day 2 for me please?',
        conversationId: 'plan-9',
      }),
    } as any);

    expect(prisma.lessonPlanMessage.findFirst).not.toHaveBeenCalled();
  });
});
