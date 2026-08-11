import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { StoryboardGenerationError, generateStoryboard, reviseStoryboard } =
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

  // The first preview render died clicking an element the model invented:
  // nothing told it what is on the page, so it guessed. The prompt must carry
  // the per-route guide of real, seeded targets and forbid clicking outside it.
  test('grounds the model in what is actually on each page', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(brief());

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    expect(system).toContain('Daily Pages - week 2');
    expect(system).toContain('Prompt Library');
    expect(system).toContain('English 10 - Period 3');
    expect(system.toLowerCase()).toContain('never invent');
  });

  // Two facts the model kept getting wrong, read straight out of failed
  // preview jobs: it wrote a redundant login step whose path navigated the
  // scene off its own page, and it re-goto'd after a navigating click, which
  // discarded the destination it had just clicked through to.
  test('tells the model it is already signed in and that goto resets the page', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(brief());

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    expect(system).toContain('already signed in');
    expect(system).toContain('OMIT "goto"');
  });

  // A hand-run job died on "scenes.1.focus: focus needs a selector, a role, or
  // text to aim at", twice in a row, because the prompt described the field as
  // `"focus": { target, "scale": ... }`. There is no `target` key in the
  // schema, so the model emitted one, it was stripped as unknown, and what was
  // left was a zoom aimed at nothing. The prompt has to name the real keys.
  test('describes focus with the keys the schema actually accepts', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(brief());

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    const focusLine = system
      .split('\n')
      .find((line) => line.includes('"focus"'));

    expect(focusLine).toBeDefined();
    expect(focusLine).not.toContain('{ target,');
    // A worked example using real field names, so the shape is unambiguous.
    expect(system).toContain('"focus": { "role": "button", "name":');
    expect(system).toContain('"scale"');
  });

  // focus is polish — it aims a push-in during framing and can never drive the
  // browser. Failing an entire generation over it wastes two model calls and
  // hands the admin a dead job for a zoom we could simply leave out.
  test('drops a focus that has nothing to aim at instead of failing the job', async () => {
    const withBadFocus = {
      ...VALID_STORYBOARD,
      scenes: [
        VALID_STORYBOARD.scenes[0],
        { ...VALID_STORYBOARD.scenes[1], focus: { scale: 1.5 } },
      ],
    };
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(withBadFocus));

    const result = await generateStoryboard(brief());

    expect(result.storyboard.scenes[1].focus).toBeUndefined();
    expect(result.storyboard.scenes).toHaveLength(2);
    // Repaired in place: no retry burned on a field we can just drop.
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
  });

  // Only the unaimable focus is dropped. A focus that names a target is the
  // whole reason product text is legible at feed size and must survive.
  test('keeps a focus that names a target', async () => {
    const withGoodFocus = {
      ...VALID_STORYBOARD,
      scenes: [
        VALID_STORYBOARD.scenes[0],
        {
          ...VALID_STORYBOARD.scenes[1],
          focus: { text: 'Overall Feedback', scale: 1.6 },
        },
      ],
    };
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(withGoodFocus));

    const result = await generateStoryboard(brief());

    expect(result.storyboard.scenes[1].focus?.text).toBe('Overall Feedback');
    expect(result.storyboard.scenes[1].focus?.scale).toBe(1.6);
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

  test('asks for a short-form single-feature storyboard when the job is a clip', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    await generateStoryboard(brief({ kind: 'CLIP' }));

    const system = getLLMCompletion.mock.calls[0][0].system as string;
    expect(system.toLowerCase()).toContain('silent');
    expect(system).toContain('5 to 15 seconds');
    expect(system.toLowerCase()).toContain('one feature');
  });

  test('sends an overlong clip back for a shorter cut', async () => {
    const longClip = {
      ...VALID_STORYBOARD,
      scenes: [
        { id: 'one', goto: '/app', waitFor: 'main', hold: 20 },
        { id: 'two', goto: '/app/my-classes', waitFor: 'main', hold: 20 },
      ],
    };
    const shortClip = {
      ...VALID_STORYBOARD,
      scenes: [{ id: 'one', goto: '/app', waitFor: 'main', hold: 2 }],
    };
    getLLMCompletion
      .mockResolvedValueOnce(JSON.stringify(longClip))
      .mockResolvedValueOnce(JSON.stringify(shortClip));

    const result = await generateStoryboard(brief({ kind: 'CLIP' }));

    expect(result.storyboard.scenes).toHaveLength(1);
    expect(getLLMCompletion).toHaveBeenCalledTimes(2);
    expect(
      JSON.stringify(getLLMCompletion.mock.calls[1][0].messages)
    ).toContain('too long');
  });

  test('gives up on a clip that stays long after the retry', async () => {
    const longClip = {
      ...VALID_STORYBOARD,
      scenes: [
        { id: 'one', goto: '/app', waitFor: 'main', hold: 20 },
        { id: 'two', goto: '/app/my-classes', waitFor: 'main', hold: 20 },
      ],
    };
    getLLMCompletion.mockResolvedValue(JSON.stringify(longClip));

    let thrown: unknown;
    try {
      await generateStoryboard(brief({ kind: 'CLIP' }));
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(StoryboardGenerationError);
    expect((thrown as Error).message).toContain('short-form');
  });

  test('does not length-cap stills storyboards', async () => {
    const longTour = {
      ...VALID_STORYBOARD,
      scenes: [
        { id: 'one', goto: '/app', waitFor: 'main', hold: 20 },
        { id: 'two', goto: '/app/my-classes', waitFor: 'main', hold: 20 },
      ],
    };
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(longTour));

    const result = await generateStoryboard(brief({ kind: 'STILLS' }));

    expect(result.storyboard.scenes).toHaveLength(2);
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
  });
});

// A first render is rarely the final cut — the operator watches it and says
// what to change ("the prompt library is barely visible; scroll to it and hold").
// A revision is a fresh generation grounded in the storyboard that produced the
// take being criticized, not a from-scratch rewrite of the brief.
describe('reviseStoryboard', () => {
  beforeEach(() => {
    getLLMCompletion.mockReset();
  });

  function revision(overrides: Record<string, unknown> = {}) {
    return {
      brief: 'Show a teacher reviewing submitted essays.',
      kind: 'CLIP' as const,
      previousStoryboard: VALID_STORYBOARD,
      feedback: 'The prompt library is barely visible. Scroll to it and hold.',
      ...overrides,
    };
  }

  test('sends the previous storyboard and the feedback to the model', async () => {
    getLLMCompletion.mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    const result = await reviseStoryboard(revision());

    expect(result.storyboard.slug).toBe('teacher-loop');
    const userMessage = getLLMCompletion.mock.calls[0][0].messages[0]
      .content as string;
    expect(userMessage).toContain('teacher-loop');
    expect(userMessage).toContain('barely visible');
    expect(userMessage).toContain('Show a teacher reviewing submitted essays.');
  });

  test('revisions keep the page guide and validation', async () => {
    getLLMCompletion
      .mockResolvedValueOnce(
        JSON.stringify({
          ...VALID_STORYBOARD,
          scenes: [{ id: 'admin', goto: '/app/admin/organizations' }],
        })
      )
      .mockResolvedValueOnce(JSON.stringify(VALID_STORYBOARD));

    const result = await reviseStoryboard(revision());

    expect(result.storyboard.scenes[0].goto).toBe('/app');
    const system = getLLMCompletion.mock.calls[0][0].system as string;
    expect(system).toContain('Prompt Library');
    expect(getLLMCompletion).toHaveBeenCalledTimes(2);
  });

  test('revised clips still get sent back when they run long', async () => {
    const longClip = {
      ...VALID_STORYBOARD,
      scenes: [
        { id: 'one', goto: '/app', waitFor: 'main', hold: 20 },
        { id: 'two', goto: '/app/my-classes', waitFor: 'main', hold: 20 },
      ],
    };
    getLLMCompletion.mockResolvedValue(JSON.stringify(longClip));

    let thrown: unknown;
    try {
      await reviseStoryboard(revision());
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(StoryboardGenerationError);
  });
});
