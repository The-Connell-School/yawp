import { beforeEach, describe, expect, mock, test } from 'bun:test';

const getLLMCompletion = mock();

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { generateActPracticeQuestions } = await import(
  './act-practice-generation.server'
);

const baseInput = {
  lessonSlug: 'fixing-comma-splices',
  skill: 'comma splices',
  lessonTitle: 'Fixing Comma Splices',
  rule: 'A comma splice joins two independent clauses with only a comma.',
  exampleSentences: ['The album dropped, fans went wild.'],
  count: 3,
};

function question(overrides: Record<string, unknown> = {}) {
  return {
    sentence: 'The telescope captured the comet, astronomers cheered at dawn.',
    underline: 'comet, astronomers',
    choices: [
      'comet, astronomers',
      'comet; astronomers',
      'comet astronomers',
      'comet, and, astronomers',
    ],
    correctChoiceIndex: 1,
    explanation: 'A semicolon joins the two independent clauses correctly.',
    ...overrides,
  };
}

beforeEach(() => {
  getLLMCompletion.mockReset();
});

describe('generateActPracticeQuestions', () => {
  test('returns validated questions tagged with generated ids', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({ questions: [question(), question()] })
    );

    const result = await generateActPracticeQuestions(baseInput);

    expect(result).toHaveLength(2);
    expect(result[0].id).toContain('fixing-comma-splices-act-gen-');
    expect(result[0].underline).toBe('comet, astronomers');
    expect(result[0].correctChoiceIndex).toBe(1);
  });

  test('grounds the request with skill, rule, and examples', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({ questions: [question()] })
    );

    await generateActPracticeQuestions(baseInput);

    const serialized = JSON.stringify(getLLMCompletion.mock.calls[0][0]);
    expect(serialized).toContain('comma splices');
    expect(serialized).toContain('two independent clauses');
    expect(serialized).toContain('The album dropped');
  });

  test('drops items whose underline is not in the sentence', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        questions: [
          question(),
          question({ underline: 'not in the sentence' }),
        ],
      })
    );

    const result = await generateActPracticeQuestions(baseInput);
    expect(result).toHaveLength(1);
  });

  test('drops items whose choice A does not equal the underline', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        questions: [
          question({
            choices: [
              'comet; astronomers', // choice A != underline
              'comet, astronomers',
              'comet astronomers',
              'comet, and, astronomers',
            ],
          }),
        ],
      })
    );

    expect(await generateActPracticeQuestions(baseInput)).toEqual([]);
  });

  test('drops inappropriate items before returning', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        questions: [
          question(),
          question({
            sentence: 'He got drunk, the party ended early.',
            underline: 'drunk, the',
            choices: ['drunk, the', 'drunk; the', 'drunk the', 'drunk, and, the'],
          }),
        ],
      })
    );

    const result = await generateActPracticeQuestions(baseInput);
    expect(result).toHaveLength(1);
    expect(result[0].sentence).toContain('telescope');
  });

  test('caps the result to the requested count', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({ questions: [question(), question(), question(), question()] })
    );

    const result = await generateActPracticeQuestions({ ...baseInput, count: 2 });
    expect(result).toHaveLength(2);
  });

  test('returns [] on unparseable output', async () => {
    getLLMCompletion.mockResolvedValueOnce('no json here');
    expect(await generateActPracticeQuestions(baseInput)).toEqual([]);
  });

  test('returns [] when the model call throws', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('no provider'));
    expect(await generateActPracticeQuestions(baseInput)).toEqual([]);
  });

  test('does not call the model for a non-positive count', async () => {
    const result = await generateActPracticeQuestions({ ...baseInput, count: 0 });
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
