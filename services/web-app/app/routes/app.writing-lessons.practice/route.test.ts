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

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({
  prisma: {},
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

type LoaderPayload = {
  title: string;
  skills: string[];
  skillTitles: string[];
  items: Array<{
    kind?: string;
    position: number;
    lessonSlug: string;
    initialStatus: string;
    question?: { choices: string[] };
    prompt?: { id: string; exercise: string; instruction: string };
  }>;
  problemCount: number;
  hasComposition: boolean;
  topic: string | null;
  topicDeclined: boolean;
  sessionPath: string;
};

async function runLoader(query: string) {
  return (await loader({
    request: new Request(
      `https://example.test/app/writing-lessons/practice${query}`
    ),
    params: {},
    context: {} as never,
  } as never)) as unknown as { data: LoaderPayload } | Response;
}

async function loadSession(query: string): Promise<LoaderPayload> {
  const response = await runLoader(query);
  return (response as { data: LoaderPayload }).data;
}

function buildRequest(fields: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return new Request('https://example.test/app/writing-lessons/practice', {
    method: 'POST',
    body,
  });
}

async function run(fields: Record<string, string>) {
  const response = await action({
    request: buildRequest(fields),
    params: {},
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
});

afterEach(() => {
  if (ORIGINAL_COMPOSITION_FLAG === undefined) {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  } else {
    process.env.COMPOSITION_PRACTICE_ENABLED = ORIGINAL_COMPOSITION_FLAG;
  }
});

describe('self-directed practice session loader', () => {
  test('builds a grammar set the student can work like an assigned one', async () => {
    // No AI available: the set falls back to the offline bank, so a session
    // always has real problems in it.
    getLLMCompletion.mockRejectedValue(new Error('no provider'));

    const data = await loadSession('?skills=fixing-comma-splices&count=5');

    expect(data.title).toBe('Fixing Comma Splices');
    expect(data.problemCount).toBe(5);
    expect(data.items).toHaveLength(5);
    expect(data.hasComposition).toBe(false);
    // Every item is a numbered, unstarted problem — the shape the shared
    // practice runner reads.
    expect(data.items.map((item) => item.position)).toEqual([1, 2, 3, 4, 5]);
    expect(
      data.items.every((item) => item.initialStatus === 'todo')
    ).toBeTrue();
    expect(data.items[0].question?.choices).toHaveLength(4);
    expect(data.sessionPath).toBe(
      '/app/writing-lessons/practice?skills=fixing-comma-splices&count=5'
    );
  });

  test('clamps the problem count and drops unknown skills', async () => {
    getLLMCompletion.mockRejectedValue(new Error('no provider'));

    const data = await loadSession(
      '?skills=fixing-comma-splices,not-a-lesson&count=99'
    );

    expect(data.skills).toEqual(['fixing-comma-splices']);
    expect(data.problemCount).toBe(20);
  });

  test('redirects to the library when no real skill is selected', async () => {
    const response = (await runLoader('?skills=not-a-lesson')) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app/writing-lessons');
  });

  test('still loads a session even when an org previously had writing practice disabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });
    getLLMCompletion.mockRejectedValue(new Error('no provider'));
    const data = await loadSession('?skills=fixing-comma-splices&count=5');
    expect(data.problemCount).toBeGreaterThan(0);
  });

  describe('composition', () => {
    beforeEach(() => {
      process.env.COMPOSITION_PRACTICE_ENABLED = 'true';
    });

    test('builds a constructed-response set', async () => {
      getLLMCompletion.mockRejectedValue(new Error('no provider'));

      const data = await loadSession('?skills=topic-sentences&count=3');

      expect(data.hasComposition).toBe(true);
      expect(data.items).toHaveLength(3);
      expect(data.items[0].kind).toBe('composition');
      expect(data.items[0].prompt?.instruction.length).toBeGreaterThan(0);
    });

    test('builds the prompts around a student topic', async () => {
      getLLMCompletion.mockResolvedValue(
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

      const data = await loadSession(
        '?skills=topic-sentences&count=2&topic=my%20basketball%20team'
      );

      expect(data.topic).toBe('my basketball team');
      expect(data.topicDeclined).toBe(false);
      expect(data.items[0].prompt?.exercise).toContain('team');
      // The model call was grounded in the student's topic.
      const userMessage = getLLMCompletion.mock.calls[0][0].messages[0].content;
      expect(userMessage).toContain('my basketball team');
      expect(data.sessionPath).toContain('topic=my+basketball+team');
    });

    test('falls back to topic templates when generation is unavailable', async () => {
      getLLMCompletion.mockRejectedValue(new Error('no provider'));

      const data = await loadSession(
        '?skills=topic-sentences&count=3&topic=skateboarding'
      );

      expect(data.topic).toBe('skateboarding');
      for (const item of data.items) {
        expect(
          `${item.prompt?.exercise} ${item.prompt?.instruction}`
        ).toContain('skateboarding');
      }
    });

    test('keeps the standard prompts when the topic trips the safety screen', async () => {
      getLLMCompletion.mockRejectedValue(new Error('no provider'));

      const data = await loadSession(
        '?skills=topic-sentences&count=3&topic=how%20to%20buy%20meth'
      );

      expect(data.topic).toBeNull();
      expect(data.topicDeclined).toBe(true);
      expect(data.items).toHaveLength(3);
      for (const item of data.items) {
        expect(
          `${item.prompt?.exercise} ${item.prompt?.instruction}`
        ).not.toContain('meth');
      }
    });

    test('includes Composition skills even if the old env flag is off', async () => {
      process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
      getLLMCompletion.mockRejectedValue(new Error('no provider'));
      const data = await loadSession('?skills=topic-sentences&count=3');
      expect(data.hasComposition).toBe(true);
      expect(data.items).toHaveLength(3);
    });
  });
});

describe('self-directed practice session action', () => {
  test('rejects a multiple-choice answer (grading is client-side)', async () => {
    await expect(
      run({
        kind: 'act',
        lessonSlug: 'fixing-comma-splices',
        promptId: 'act-1',
        selectedChoiceIndex: '1',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('rejects an unknown skill', async () => {
    await expect(
      run({ intent: 'check-rewrite', lessonSlug: 'not-a-lesson' })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('accepts attempts even if an org previously had writing practice disabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });
    getLLMCompletion.mockRejectedValue(new Error('upstream 529'));
    const result = await run({
      intent: 'check-rewrite',
      lessonSlug: 'fixing-comma-splices',
      questionId: 'act-1',
      exercise: 'The phone costs a lot, students cannot afford it.',
      instruction:
        'Rewrite the whole sentence so the underlined part is correct.',
      response: 'The phone costs a great deal, students cannot afford it.',
    });
    expect(result.intent).toBe('check-rewrite');
  });

  describe('check-rewrite intent', () => {
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

      const result = await run({
        intent: 'check-rewrite',
        lessonSlug: 'fixing-comma-splices',
        questionId: 'act-1',
        exercise: 'The phone costs a lot, students cannot afford it.',
        instruction:
          'Rewrite the whole sentence so the underlined part is correct.',
        response: 'The phone costs a lot; students cannot afford it.',
      });

      expect(result.intent).toBe('check-rewrite');
      expect(result.questionId).toBe('act-1');
      expect(result.feedback.status).toBe('strong');
      expect(result.feedback.degraded).toBe(false);

      // The tutor is grounded in this lesson's skill, not the generic prompt.
      const call = getLLMCompletion.mock.calls[0][0];
      expect(call.messages[0].content).toContain('comma splices');
    });

    test('an unchanged sentence is refused before the tutor is called', async () => {
      const sentence = 'The phone costs a lot, students cannot afford it.';
      const result = await run({
        intent: 'check-rewrite',
        lessonSlug: 'fixing-comma-splices',
        questionId: 'act-1',
        exercise: sentence,
        instruction:
          'Rewrite the whole sentence so the underlined part is correct.',
        response: sentence,
      });

      expect(result.feedback.status).toBe('needs_revision');
      expect(result.feedback.summary).toMatch(/still the original sentence/i);
      expect(getLLMCompletion).not.toHaveBeenCalled();
    });

    test('a tutor outage never reports the rewrite as correct', async () => {
      getLLMCompletion.mockRejectedValue(new Error('upstream 529'));

      const result = await run({
        intent: 'check-rewrite',
        lessonSlug: 'fixing-comma-splices',
        questionId: 'act-1',
        exercise: 'The phone costs a lot, students cannot afford it.',
        instruction:
          'Rewrite the whole sentence so the underlined part is correct.',
        // Still a comma splice — the fallback cannot know that, so it must not
        // imply the student got it right.
        response: 'The phone costs a great deal, students cannot afford it.',
      });

      expect(result.feedback.degraded).toBe(true);
      expect(result.feedback.status).not.toBe('strong');
      expect(result.feedback.strengths).toHaveLength(0);
    });

    test('is refused on a composition lesson', async () => {
      process.env.COMPOSITION_PRACTICE_ENABLED = 'true';

      await expect(
        run({
          intent: 'check-rewrite',
          lessonSlug: 'topic-sentences',
          questionId: 'act-1',
          exercise: 'A sentence.',
          instruction: 'Rewrite it.',
          response: 'A different sentence.',
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(getLLMCompletion).not.toHaveBeenCalled();
    });
  });

  describe('composition attempts', () => {
    beforeEach(() => {
      process.env.COMPOSITION_PRACTICE_ENABLED = 'true';
    });

    test('a blank response is caught by the guardrail before the tutor', async () => {
      const result = await run({
        kind: 'composition',
        lessonSlug: 'topic-sentences',
        position: '1',
        promptId: 'topic-sentences-1',
        exercise: 'Rewrite this announcement as a claim.',
        instruction: 'Write a topic sentence.',
        response: '',
      });

      expect(result.kind).toBe('composition');
      expect(result.position).toBe(1);
      // Guardrailed attempts never count toward the set's progress.
      expect(result.recorded).toBe(false);
      expect(result.feedback.status).toBe('needs_revision');
      expect(result.feedback.summary).toMatch(/add your revision/i);
      expect(getLLMCompletion).not.toHaveBeenCalled();
    });

    test('a real response returns offline-degraded tutor feedback', async () => {
      getLLMCompletion.mockRejectedValue(new Error('tutor offline'));

      const result = await run({
        kind: 'composition',
        lessonSlug: 'topic-sentences',
        position: '2',
        promptId: 'topic-sentences-1',
        exercise: 'Rewrite this announcement as a claim.',
        instruction: 'Write a topic sentence.',
        response:
          'The cafeteria menu punishes the students who most need a real lunch.',
      });

      expect(result.recorded).toBe(true);
      expect(result.position).toBe(2);
      expect(result.feedback.degraded).toBe(true);
      expect(result.feedback.summary).toMatch(/tutor is offline/i);
      // A degraded verdict can never read as mastery.
      expect(result.feedback.status).not.toBe('strong');
    });

    test('a configured tutor produces graded, non-degraded feedback', async () => {
      getLLMCompletion.mockResolvedValue(
        JSON.stringify({
          status: 'strong',
          summary: 'This lands as a clear, arguable claim.',
          strengths: ['You made a specific claim a paragraph can prove.'],
          focus: ['Make sure the rest of the paragraph delivers on it.'],
          encouragement: 'Nice work — keep that edge.',
        })
      );

      const result = await run({
        kind: 'composition',
        lessonSlug: 'topic-sentences',
        position: '1',
        promptId: 'topic-sentences-2',
        exercise: 'Turn this fact into a claim.',
        instruction: 'Write a topic sentence.',
        response:
          'The new skate park has quietly become the town’s only free hangout.',
      });

      expect(result.feedback.degraded).toBe(false);
      expect(result.feedback.status).toBe('strong');
      expect(result.recorded).toBe(true);
    });

    test('is accepted even if the old env flag is off', async () => {
      process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
      getLLMCompletion.mockRejectedValue(new Error('tutor offline'));
      const result = await run({
        kind: 'composition',
        lessonSlug: 'topic-sentences',
        position: '1',
        promptId: 'topic-sentences-1',
        exercise: 'Rewrite this announcement as a claim.',
        instruction: 'Write a topic sentence.',
        response: 'a real revision attempt',
      });
      expect(result.recorded).toBe(true);
    });

    test('rate-limits composition attempts per student', async () => {
      getLLMCompletion.mockResolvedValue(
        JSON.stringify({
          status: 'strong',
          summary: 'ok',
          strengths: [],
          focus: [],
          encouragement: '',
        })
      );
      mock.module('~/utils/ai-admission.server', () => {
        class AiRateLimitError extends Error {
          retryAfterSeconds = 30;
        }
        return {
          AiRateLimitError,
          reserveAiRequest: () => {
            throw new AiRateLimitError();
          },
        };
      });
      const { action: limitedAction } = await import('./route');
      const response = (await limitedAction({
        request: buildRequest({
          kind: 'composition',
          lessonSlug: 'topic-sentences',
          position: '1',
          promptId: 'topic-sentences-1',
          exercise: 'Rewrite this',
          instruction: 'Write a topic sentence.',
          response: 'A real attempt',
        }),
        params: {},
        context: {} as never,
      } as any)) as unknown as Response;
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeTruthy();
    });

    test('is refused on a grammar lesson', async () => {
      await expect(
        run({
          kind: 'composition',
          lessonSlug: 'fixing-comma-splices',
          position: '1',
          promptId: 'x',
          exercise: 'A sentence.',
          instruction: 'Write something.',
          response: 'a real revision attempt',
        })
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
