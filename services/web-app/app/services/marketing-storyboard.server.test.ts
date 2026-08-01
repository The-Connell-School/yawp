import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { StoryboardGenerationError, generateStoryboard } =
  await import('./marketing-storyboard.server');

const VALID_STORYBOARD = {
  slug: 'teacher-loop',
  title: 'The teacher loop',
  audience: 'Department chairs',
  persona: 'teacher',
  viewport: 'desktop',
  scenes: [
    { id: 'dashboard', goto: '/app', waitFor: 'main', hold: 2 },
    { id: 'student-work', goto: '/app/student-work', waitFor: 'main', hold: 2 },
  ],
};

function brief(overrides: Record<string, unknown> = {}) {
  return {
    brief: 'Show a teacher reviewing submitted essays.',
    kind: 'STILLS' as const,
    ...overrides,
  };
}

describe('generateStoryboard', () => {
  beforeEach(() => {
    getLLMCompletion.mockReset();
  });

  test('returns a validated storyboard and the model that wrote it', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    const result = await generateStoryboard(brief());

    expect(result.storyboard.slug).toBe('teacher-loop');
    expect(result.storyboard.scenes).toHaveLength(2);
    expect(result.model).toContain('claude');
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
  });

  test('unwraps a fenced code block', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      `Here you go:\n\`\`\`json\n${JSON.stringify(VALID_STORYBOARD)}\n\`\`\`\n`
    );

    const result = await generateStoryboard(brief());

    expect(result.storyboard.title).toBe('The teacher loop');
  });

  test('tells the model what the app allows', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(brief());

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    expect(system).toContain('/app/student-work');
    expect(system).toContain('student-graded');
    expect(system).not.toContain('/app/admin');
  });

  test('passes the brief, audience, and subject to the model', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(
      brief({
        audience: 'ELA teachers',
        subject: { type: 'ASSIGNMENT_TYPE', label: 'Argumentative Essay' },
      })
    );

    const userMessage = getLLMCompletion.mock.calls[0][0].messages[0]
      .content as string;
    expect(userMessage).toContain('Show a teacher reviewing submitted essays.');
    expect(userMessage).toContain('ELA teachers');
    expect(userMessage).toContain('Argumentative Essay');
  });

  test('retries once with the validation errors when the first storyboard is invalid', async () => {
    getLLMCompletion
      .mockResolvedValueOnce(
        JSON.stringify({
          ...VALID_STORYBOARD,
          scenes: [{ id: 'admin', goto: '/app/admin/organizations' }],
        })
      )
      .mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    const result = await generateStoryboard(brief());

    expect(result.storyboard.slug).toBe('teacher-loop');
    expect(getLLMCompletion).toHaveBeenCalledTimes(2);

    const retryMessages = getLLMCompletion.mock.calls[1][0].messages;
    expect(JSON.stringify(retryMessages)).toContain('route must be one of');
  });

  test('throws a readable error when the model cannot produce a valid storyboard', async () => {
    getLLMCompletion.mockResolvedValue(
      JSON.stringify({ ...VALID_STORYBOARD, persona: 'root' })
    );

    let thrown: unknown;
    try {
      await generateStoryboard(brief());
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(StoryboardGenerationError);
    expect((thrown as Error).message).toContain('persona');
    expect(getLLMCompletion).toHaveBeenCalledTimes(2);
  });

  test('throws when the model returns something that is not json', async () => {
    getLLMCompletion.mockResolvedValue('I cannot help with that.');

    expect(generateStoryboard(brief())).rejects.toBeInstanceOf(
      StoryboardGenerationError
    );
  });

  test('records the caller in llm metadata so the audit log can find these calls', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(brief());

    expect(getLLMCompletion.mock.calls[0][0].metadata).toMatchObject({
      caller: 'marketing-storyboard',
    });
  });

  test('asks for a clip-shaped storyboard when the job is a clip', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(brief({ kind: 'CLIP' }));

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    expect(system.toLowerCase()).toContain('silent');
  });
});
