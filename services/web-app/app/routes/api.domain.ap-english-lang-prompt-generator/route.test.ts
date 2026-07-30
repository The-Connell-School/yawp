import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getLLMCompletion = mock();

// Only auth and the LLM are stubbed. Assignment-type access and the library
// lookup run for real against the mocked prisma, so this file never replaces a
// module the assignment-type route also imports — bun's module mocks are global
// to the test run, and overriding a shared export there breaks other suites.
const prisma = {
  class: { findMany: mock() },
  assignmentType: { findFirst: mock(), findMany: mock() },
  organizationAssignmentType: { findMany: mock() },
  school: { findMany: mock() },
  orgMembership: { findMany: mock() },
  apEnglishLangPromptLibraryEntry: { findMany: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
// bun's module mocks are global to the test run, so the stub has to keep the
// whole module surface — dropping AgentType breaks other suites that import it.
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: {
    Assistant: 'assistant',
    User: 'user',
  },
  getLLMCompletion,
}));

const { action } = await import('./route');

function statusOf(response: any) {
  return response.init?.status ?? response.status;
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function request(
  messages: unknown,
  { assignmentTypeId = 'at-1' }: { assignmentTypeId?: string } = {}
) {
  const body = new URLSearchParams();
  if (assignmentTypeId) body.set('assignmentTypeId', assignmentTypeId);
  if (messages !== undefined) {
    body.set(
      'messages',
      typeof messages === 'string' ? messages : JSON.stringify(messages)
    );
  }
  return new Request(
    'https://example.test/api/domain/ap-english-lang-prompt-generator',
    { method: 'POST', body }
  );
}

const draft = {
  title: 'What We Owe Strangers',
  prompt:
    'Communities are held together by obligations nobody signed up for. Write an essay that argues your position on what we owe people we will never meet.',
  frqType: 'argument',
  focusSkill: 'line-of-reasoning',
  difficulty: 'developing',
};

describe('api.domain.ap-english-lang-prompt-generator', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getLLMCompletion.mockReset();
    prisma.class.findMany.mockReset();
    prisma.assignmentType.findFirst.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.apEnglishLangPromptLibraryEntry.findMany.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);
    prisma.assignmentType.findFirst.mockResolvedValue({ id: 'at-1' });
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'at-1' },
    ]);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.apEnglishLangPromptLibraryEntry.findMany.mockResolvedValue([
      {
        externalKey: 'argument-disagreement',
        frqType: 'argument',
        title: 'The Value of Disagreement — Argument',
        prompt: 'Write an essay that argues your position on disagreement.',
        focusSkill: 'line-of-reasoning',
        difficulty: 'exam-ready',
      },
    ]);
  });

  test('returns the reply and drafted options from the model', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({ reply: 'Three angles on obligation.', options: [draft] })
    );

    const body = await readBody(
      await action({ request: request([{ role: 'user', content: 'obligation' }]) } as never)
    );

    expect(body.success).toBe(true);
    expect(body.reply).toBe('Three angles on obligation.');
    expect(body.options[0].title).toBe('What We Owe Strangers');
  });

  test('seeds the system prompt from the course library', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({ reply: 'Drafted.', options: [draft] })
    );

    await action({
      request: request([{ role: 'user', content: 'obligation' }]),
    } as never);

    expect(
      prisma.apEnglishLangPromptLibraryEntry.findMany.mock.calls[0][0].where
    ).toMatchObject({ assignmentTypeId: 'at-1' });
    const call = getLLMCompletion.mock.calls[0][0];
    expect(call.system).toContain(
      'Write an essay that argues your position on disagreement.'
    );
    expect(call.system).toContain('AP English Language');
  });

  test('rejects a teacher who cannot see the assignment type', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(null);

    const response = await action({
      request: request([{ role: 'user', content: 'obligation' }]),
    } as never);

    expect(statusOf(response)).toBe(404);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rejects non-teachers', async () => {
    requireMembership.mockResolvedValue({ id: 'student-1', role: 'STUDENT' });

    const response = await action({
      request: request([{ role: 'user', content: 'obligation' }]),
    } as never);

    expect(statusOf(response)).toBe(403);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('rejects an empty or unparseable conversation', async () => {
    const empty = await action({ request: request([]) } as never);
    expect(statusOf(empty)).toBe(400);

    const garbage = await action({ request: request('not json') } as never);
    expect(statusOf(garbage)).toBe(400);

    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('requires the last message to come from the teacher', async () => {
    const response = await action({
      request: request([{ role: 'assistant', content: 'Drafted.' }]),
    } as never);

    expect(statusOf(response)).toBe(400);
    expect(getLLMCompletion).not.toHaveBeenCalled();
  });

  test('surfaces a friendly error when the model call fails', async () => {
    getLLMCompletion.mockRejectedValue(new Error('upstream down'));

    const response = await action({
      request: request([{ role: 'user', content: 'obligation' }]),
    } as never);
    const body = await readBody(response);

    expect(statusOf(response)).toBe(500);
    expect(body.success).toBe(false);
    // Never leak the upstream failure to a teacher.
    expect(body.message).not.toContain('upstream down');
  });

  test('never shows the teacher raw JSON when the response is truncated', async () => {
    getLLMCompletion.mockResolvedValue(
      '{"reply": "Here are three ang'
    );

    const body = await readBody(
      await action({ request: request([{ role: 'user', content: 'x' }]) } as never)
    );

    expect(body.success).toBe(true);
    expect(body.reply).not.toContain('{"reply"');
    expect(body.options).toEqual([]);
  });

  test('passes plain prose through as a chat reply', async () => {
    getLLMCompletion.mockResolvedValue(
      'Which unit are you teaching right now?'
    );

    const body = await readBody(
      await action({ request: request([{ role: 'user', content: 'x' }]) } as never)
    );

    expect(body.reply).toBe('Which unit are you teaching right now?');
    expect(body.options).toEqual([]);
  });

  test('bounds the history it forwards to the model', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({ reply: 'Drafted.', options: [draft] })
    );
    const longHistory = Array.from({ length: 60 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${index}`,
    }));
    longHistory.push({ role: 'user', content: 'final ask' });

    await action({ request: request(longHistory) } as never);

    const call = getLLMCompletion.mock.calls[0][0];
    expect(call.messages.length).toBeLessThanOrEqual(24);
    expect(call.messages[call.messages.length - 1].content).toBe('final ask');
  });
});
