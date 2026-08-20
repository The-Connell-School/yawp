import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';

const ORIGINAL_COMPOSITION_FLAG = process.env.COMPOSITION_PRACTICE_ENABLED;

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();
const getLoungeModuleLinkForLesson = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: mock().mockResolvedValue([]) } },
}));
mock.module('~/utils/writing-lessons/lounge-links.server', () => ({
  getLoungeModuleLinkForLesson,
}));
// Mock the leaf LLM call (not the generation/feedback modules) so this test
// never clobbers the module-as-subject in the generation/feedback unit tests.
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

function buildRequest(fields: Record<string, string | string[]>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((item) => body.append(key, item));
    else body.append(key, value);
  }
  return new Request(
    'http://localhost/app/writing-lessons/fixing-comma-splices',
    { method: 'POST', body }
  );
}

async function run(
  fields: Record<string, string | string[]>,
  lessonSlug = 'fixing-comma-splices'
) {
  const response = await action({
    request: buildRequest(fields),
    params: { lessonSlug },
    context: {},
  } as never);
  return (response as unknown as { data?: unknown }).data ?? response;
}

afterEach(() => {
  if (ORIGINAL_COMPOSITION_FLAG === undefined) {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  } else {
    process.env.COMPOSITION_PRACTICE_ENABLED = ORIGINAL_COMPOSITION_FLAG;
  }
});

describe('writing lesson detail route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();
    getLoungeModuleLinkForLesson.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
  });

  test('loads a lesson by direct URL with its ACT questions', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/revising-for-wordiness'
      ),
      params: { lessonSlug: 'revising-for-wordiness' },
      context: {} as never,
    } as never);

    expect(response.data.lesson.slug).toBe('revising-for-wordiness');
    expect(response.data.actQuestions.length).toBeGreaterThan(0);
    expect(response.data.actQuestions[0].choices).toHaveLength(4);
  });

  test('links teachers on a composition lesson to the Lounge module', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
    const link = {
      trainingId: 'training-1',
      trainingTitle: 'The Thesis-Driven Essay',
      moduleId: 'module-1',
      moduleTitle: 'Lesson 3: Developing a Thesis Statement',
    };
    getLoungeModuleLinkForLesson.mockResolvedValue(link);

    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/thesis-statements'
      ),
      params: { lessonSlug: 'thesis-statements' },
      context: {} as never,
    } as never);

    expect(response.data.loungeModule).toEqual(link);
    expect(getLoungeModuleLinkForLesson).toHaveBeenCalledWith(
      'thesis-statements',
      'teacher-1'
    );
  });

  test('does not resolve a Lounge link for students', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/thesis-statements'
      ),
      params: { lessonSlug: 'thesis-statements' },
      context: {} as never,
    } as never);

    expect(response.data.loungeModule).toBeNull();
    expect(getLoungeModuleLinkForLesson).not.toHaveBeenCalled();
  });

  test('does not resolve a Lounge link on grammar lessons', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });

    const response = await loader({
      request: new Request(
        'https://example.test/app/writing-lessons/revising-for-wordiness'
      ),
      params: { lessonSlug: 'revising-for-wordiness' },
      context: {} as never,
    } as never);

    expect(response.data.loungeModule).toBeNull();
    expect(getLoungeModuleLinkForLesson).not.toHaveBeenCalled();
  });
});

describe('writing lesson practice action - generate-act intent', () => {
  const validQuestion = {
    sentence: 'The comet appeared at dawn, observers gasped in wonder.',
    underline: 'dawn, observers',
    choices: [
      'dawn, observers',
      'dawn; observers',
      'dawn observers',
      'dawn, and, observers',
    ],
    correctChoiceIndex: 1,
    explanation: 'A semicolon correctly joins the two independent clauses.',
  };

  test('returns AI ACT questions tagged with generated ids', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({ questions: [validQuestion, validQuestion] })
    );

    const result = (await run({ intent: 'generate-act', count: '2' })) as {
      intent: string;
      questions: Array<{ id: string; correctChoiceIndex: number }>;
    };

    expect(result.intent).toBe('generate-act');
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].id).toContain('fixing-comma-splices-act-gen-');
    expect(result.questions[0].correctChoiceIndex).toBe(1);
  });

  test('degrades to an empty set when generation fails', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('no provider'));

    const result = (await run({ intent: 'generate-act', count: '5' })) as {
      intent: string;
      questions: unknown[];
    };

    expect(result.intent).toBe('generate-act');
    expect(result.questions).toEqual([]);
  });

  test('rejects an unsupported intent (grading is client-side)', async () => {
    await expect(run({ intent: 'check', promptId: 'x' })).rejects.toMatchObject(
      { status: 400 }
    );
  });
});

describe('writing lesson action Composition rollout gate', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
  });

  test.each(['check-rewrite', 'generate-act'])(
    'rejects %s for a Composition lesson before AI work',
    async (intent) => {
      await expect(
        run({ intent, response: 'A real response.' }, 'topic-sentences')
      ).rejects.toMatchObject({ status: 404 });
      expect(getLLMCompletion).not.toHaveBeenCalled();
    }
  );
});

describe('writing lesson practice action - check-rewrite intent', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
  });

  test('sends a written grammar correction to the tutor', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({
        status: 'strong',
        summary: 'You split the clauses cleanly.',
        strengths: ['You used a semicolon to join two independent clauses.'],
        focus: ['Try the same fix with a coordinating conjunction.'],
        encouragement: 'Nice control.',
      })
    );

    const result = (await run({
      intent: 'check-rewrite',
      questionId: 'act-1',
      exercise: 'The phone costs a lot, students cannot afford it.',
      instruction:
        'Rewrite the whole sentence so the underlined part is correct.',
      response: 'The phone costs a lot; students cannot afford it.',
    })) as {
      intent: string;
      questionId: string;
      feedback: { status: string; degraded: boolean };
    };

    expect(result.intent).toBe('check-rewrite');
    expect(result.questionId).toBe('act-1');
    expect(result.feedback.status).toBe('strong');
    expect(result.feedback.degraded).toBe(false);
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);

    // The tutor is grounded in this lesson's skill, not the generic prompt.
    const call = getLLMCompletion.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    expect(call.messages[0].content).toContain('comma splices');
  });

  test('an unchanged sentence is refused before the tutor is called', async () => {
    const sentence = 'The phone costs a lot, students cannot afford it.';
    const result = (await run({
      intent: 'check-rewrite',
      questionId: 'act-1',
      exercise: sentence,
      instruction:
        'Rewrite the whole sentence so the underlined part is correct.',
      response: sentence,
    })) as { feedback: { status: string; summary: string } };

    expect(result.feedback.status).toBe('needs_revision');
    expect(result.feedback.summary).toMatch(/still the original sentence/i);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('a tutor outage never reports the rewrite as correct', async () => {
    getLLMCompletion.mockRejectedValue(new Error('upstream 529'));

    const result = (await run({
      intent: 'check-rewrite',
      questionId: 'act-1',
      exercise: 'The phone costs a lot, students cannot afford it.',
      instruction:
        'Rewrite the whole sentence so the underlined part is correct.',
      // Still a comma splice — the fallback cannot know that, so it must not
      // imply the student got it right.
      response: 'The phone costs a great deal, students cannot afford it.',
    })) as {
      feedback: { status: string; degraded: boolean; strengths: string[] };
    };

    expect(result.feedback.degraded).toBe(true);
    expect(result.feedback.status).not.toBe('strong');
    expect(result.feedback.strengths).toHaveLength(0);
  });
});

describe('writing lesson practice action - check-composition intent', () => {
  async function runComposition(
    fields: Record<string, string | string[]>,
    lessonSlug = 'topic-sentences'
  ) {
    const response = await action({
      request: buildRequest(fields),
      params: { lessonSlug },
      context: {},
    } as never);
    return (response as unknown as { data?: any }).data ?? response;
  }

  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
    process.env.COMPOSITION_PRACTICE_ENABLED = 'true';
  });

  afterAll(() => {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  });

  test('a blank response is caught by the guardrail before the tutor', async () => {
    const result = (await runComposition({
      intent: 'check-composition',
      promptId: 'topic-sentences-1',
      exercise: 'Rewrite this announcement as a claim.',
      instruction: 'Write a topic sentence.',
      response: '',
    })) as {
      intent: string;
      promptId: string;
      feedback: { status: string; summary: string; degraded: boolean };
    };

    expect(result.intent).toBe('check-composition');
    expect(result.promptId).toBe('topic-sentences-1');
    expect(result.feedback.status).toBe('needs_revision');
    expect(result.feedback.summary).toMatch(/add your revision/i);
    // The guardrail is deterministic — the tutor is never called.
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('a real response returns offline-degraded tutor feedback', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('tutor offline'));

    const result = (await runComposition({
      intent: 'check-composition',
      promptId: 'topic-sentences-1',
      exercise: 'Rewrite this announcement as a claim.',
      instruction: 'Write a topic sentence.',
      response:
        'The cafeteria menu punishes the students who most need a real lunch.',
    })) as { feedback: { degraded: boolean; summary: string } };

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(result.feedback.degraded).toBe(true);
    expect(result.feedback.summary).toMatch(/tutor is offline/i);
  });

  test('a configured tutor produces graded, non-degraded feedback', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        status: 'strong',
        summary: 'This lands as a clear, arguable claim.',
        strengths: ['You made a specific claim a paragraph can prove.'],
        focus: ['Make sure the rest of the paragraph delivers on it.'],
        encouragement: 'Nice work — keep that edge.',
      })
    );

    const result = (await runComposition({
      intent: 'check-composition',
      promptId: 'topic-sentences-2',
      exercise: 'Turn this fact into a claim.',
      instruction: 'Write a topic sentence.',
      response:
        'The new skate park has quietly become the town’s only free hangout.',
    })) as { feedback: { degraded: boolean; status: string } };

    expect(result.feedback.degraded).toBe(false);
    expect(result.feedback.status).toBe('strong');
  });

  test('is rejected when the composition flag is off', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
    await expect(
      runComposition({
        intent: 'check-composition',
        promptId: 'topic-sentences-1',
        response: 'a real revision attempt',
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('writing lesson practice action - personalize-composition intent', () => {
  async function runPersonalize(
    fields: Record<string, string | string[]>,
    lessonSlug = 'topic-sentences'
  ) {
    const response = await action({
      request: buildRequest(fields),
      params: { lessonSlug },
      context: {},
    } as never);
    return (response as unknown as { data?: any }).data ?? response;
  }

  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org', writingPracticeEnabled: true },
    });
    process.env.COMPOSITION_PRACTICE_ENABLED = 'true';
  });

  afterAll(() => {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  });

  test('returns AI prompts grounded in the student topic', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        prompts: [
          {
            exercise: 'Your team just lost a final. Make a claim about it.',
            instruction: 'Write a topic sentence about your team.',
          },
          {
            exercise: 'A fan says the team is cursed.',
            instruction: 'Turn that into an arguable claim.',
          },
        ],
      })
    );

    const result = await runPersonalize({
      intent: 'personalize-composition',
      topic: 'my basketball team',
    });

    expect(result.intent).toBe('personalize-composition');
    expect(result.ok).toBe(true);
    expect(result.topic).toBe('my basketball team');
    expect(result.source).toBe('ai');
    expect(result.prompts.length).toBeGreaterThan(1);
    expect(new Set(result.prompts.map((p: { id: string }) => p.id)).size).toBe(
      result.prompts.length
    );
    // The model call was grounded in the student's topic.
    const userMessage = getLLMCompletion.mock.calls[0][0].messages[0].content;
    expect(userMessage).toContain('my basketball team');
  });

  test('falls back to topic templates when generation is unavailable', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('no provider'));

    const result = await runPersonalize({
      intent: 'personalize-composition',
      topic: 'skateboarding',
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('template');
    expect(result.prompts.length).toBeGreaterThanOrEqual(3);
    for (const prompt of result.prompts) {
      expect(`${prompt.exercise} ${prompt.instruction}`).toContain(
        'skateboarding'
      );
    }
  });

  test('asks for a different topic when the topic trips the safety screen', async () => {
    const result = await runPersonalize({
      intent: 'personalize-composition',
      topic: 'how to buy meth',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/topic/i);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rejects the intent on grammar lessons', async () => {
    await expect(
      runPersonalize(
        { intent: 'personalize-composition', topic: 'music' },
        'fixing-comma-splices'
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  test('is rejected when the composition flag is off', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
    await expect(
      runPersonalize({ intent: 'personalize-composition', topic: 'music' })
    ).rejects.toMatchObject({ status: 404 });
  });
});
