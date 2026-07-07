import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { generatePracticePrompts } =
  await import('./practice-prompt-generation.server');

const baseInput = {
  skill: 'comma splices',
  lessonTitle: 'Fixing Comma Splices',
  rule: 'A comma splice joins two independent clauses with only a comma.',
  exampleExercises: ['The album dropped, fans went wild.'],
  count: 3,
};

beforeEach(() => {
  getLLMCompletion.mockReset();
});

describe('generatePracticePrompts', () => {
  test('returns validated, trimmed prompts from the model', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        prompts: [
          {
            exercise: '  The team lost, the fans left.  ',
            instruction: 'Fix it.',
          },
          { exercise: 'She sang, the crowd cheered.', instruction: 'Fix it.' },
          { exercise: 'It rained, we stayed in.', instruction: 'Fix it.' },
        ],
      })
    );

    const prompts = await generatePracticePrompts(baseInput);

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(prompts).toHaveLength(3);
    expect(prompts[0].exercise).toBe('The team lost, the fans left.');
  });

  test('grounds the request with the skill, rule, and examples', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({ prompts: [{ exercise: 'A, B.', instruction: 'Fix.' }] })
    );

    await generatePracticePrompts(baseInput);

    const serialized = JSON.stringify(getLLMCompletion.mock.calls[0][0]);
    expect(serialized).toContain('comma splices');
    expect(serialized).toContain('two independent clauses');
    expect(serialized).toContain('The album dropped');
  });

  test('caps the result to the requested count', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        prompts: Array.from({ length: 8 }, (_, index) => ({
          exercise: `Sentence ${index}.`,
          instruction: 'Fix it.',
        })),
      })
    );

    const prompts = await generatePracticePrompts({ ...baseInput, count: 3 });

    expect(prompts).toHaveLength(3);
  });

  test('returns [] on unparseable output (caller falls back to static)', async () => {
    getLLMCompletion.mockResolvedValueOnce('sorry, no JSON here');

    expect(await generatePracticePrompts(baseInput)).toEqual([]);
  });

  test('returns [] when the model call throws', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('no provider'));

    expect(await generatePracticePrompts(baseInput)).toEqual([]);
  });

  test('does not call the model for a non-positive count', async () => {
    const prompts = await generatePracticePrompts({ ...baseInput, count: 0 });

    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prompts).toEqual([]);
  });
});
