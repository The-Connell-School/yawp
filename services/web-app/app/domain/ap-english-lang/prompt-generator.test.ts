import { describe, expect, test } from 'bun:test';
import {
  buildGeneratorSystemPrompt,
  resolveGeneratorModel,
  selectFewShotExamples,
} from './prompt-generator';
import {
  GENERATOR_OPTION_COUNT,
  GeneratorResponseSchema,
  MAX_GENERATOR_OUTPUT_TOKENS,
} from './generated-prompt';

const corpus = [
  {
    externalKey: 'argument-disagreement',
    frqType: 'argument',
    title: 'The Value of Disagreement — Argument',
    prompt: 'Write an essay that argues your position on the value of disagreement.',
    focusSkill: 'line-of-reasoning',
    difficulty: 'exam-ready',
  },
  {
    externalKey: 'argument-failure',
    frqType: 'argument',
    title: 'The Role of Failure — Argument',
    prompt: 'Write an essay that argues your position on what failure teaches.',
    focusSkill: 'counterargument',
    difficulty: 'developing',
  },
  {
    externalKey: 'argument-success',
    frqType: 'argument',
    title: 'Redefining Success — Argument',
    prompt: 'Write an essay that argues your position on how success is defined.',
    focusSkill: 'defining-terms',
    difficulty: 'developing',
  },
  {
    externalKey: 'synthesis-start-times',
    frqType: 'synthesis',
    title: 'School Start Times — Synthesis',
    prompt: 'Using at least three sources, argue a position on start times.',
    focusSkill: 'source-integration',
    difficulty: 'exam-ready',
  },
  {
    externalKey: 'rhetorical-gettysburg',
    frqType: 'rhetorical_analysis',
    title: 'The Gettysburg Address — Rhetorical Analysis',
    prompt: 'Analyze the rhetorical choices Lincoln makes.',
    focusSkill: 'rhetorical-situation',
    difficulty: 'exam-ready',
  },
];

describe('resolveGeneratorModel', () => {
  test('honors a configured Claude model', () => {
    expect(resolveGeneratorModel({ AI_MODEL: 'claude-opus-4-6' })).toBe(
      'claude-opus-4-6'
    );
  });

  test('falls back to a stable default for non-Claude or missing models', () => {
    expect(resolveGeneratorModel({ AI_MODEL: 'gpt-4o' })).toBe(
      'claude-sonnet-4-6'
    );
    expect(resolveGeneratorModel({})).toBe('claude-sonnet-4-6');
  });
});

describe('selectFewShotExamples', () => {
  test('shows only argument prompts, since that is all it may draft', () => {
    const examples = selectFewShotExamples(corpus);

    expect(examples.length).toBeGreaterThan(0);
    expect(examples.every((entry) => entry.frqType === 'argument')).toBe(true);
  });

  test('varies focus skill so the drafts are not all the same move', () => {
    const skills = new Set(
      selectFewShotExamples(corpus).map((entry) => entry.focusSkill)
    );

    expect(skills.size).toBeGreaterThanOrEqual(2);
  });

  test('is deterministic so the system prompt stays cacheable', () => {
    expect(selectFewShotExamples(corpus).map((e) => e.externalKey)).toEqual(
      selectFewShotExamples(corpus).map((e) => e.externalKey)
    );
  });

  test('handles a corpus with no argument prompts', () => {
    expect(
      selectFewShotExamples(corpus.filter((e) => e.frqType !== 'argument'))
    ).toEqual([]);
  });
});

describe('buildGeneratorSystemPrompt', () => {
  const systemPrompt = buildGeneratorSystemPrompt(corpus);

  test('teaches the AP argument task and its 6-point rubric rows', () => {
    expect(systemPrompt).toContain('AP English Language');
    expect(systemPrompt).toContain('Thesis');
    expect(systemPrompt).toContain('Evidence');
    expect(systemPrompt).toContain('Sophistication');
  });

  test('shows the model real argument prompts to imitate', () => {
    expect(systemPrompt).toContain(
      'Write an essay that argues your position on the value of disagreement.'
    );
  });

  test('confines the model to argument prompts and forbids invented sources', () => {
    expect(systemPrompt).toContain('argument');
    // The whole reason Q1/Q2 are out of scope.
    expect(systemPrompt.toLowerCase()).toContain('do not invent');
    expect(systemPrompt).toContain('synthesis');
  });

  test('pins the JSON contract the route parses', () => {
    expect(systemPrompt).toContain('"reply"');
    expect(systemPrompt).toContain('"options"');
    expect(systemPrompt).toContain('"title"');
    expect(systemPrompt).toContain('"prompt"');
    expect(systemPrompt).toContain(String(GENERATOR_OPTION_COUNT));
  });

  test('lists the closed vocabularies a draft may be tagged with', () => {
    expect(systemPrompt).toContain('exam-ready');
    expect(systemPrompt).toContain('developing');
  });
});

describe('GeneratorResponseSchema', () => {
  test('accepts a reply with drafted options', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here are three angles.',
      options: [
        {
          title: 'What We Owe Strangers',
          prompt: 'Write an essay that argues your position.',
          frqType: 'argument',
          focusSkill: 'line-of-reasoning',
          difficulty: 'developing',
        },
      ],
    });

    expect(parsed.options).toHaveLength(1);
    expect(parsed.options[0].title).toBe('What We Owe Strangers');
  });

  test('accepts a clarifying question with no options yet', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'What unit are you in?',
    });

    expect(parsed.options).toEqual([]);
  });

  test('coerces a singular prompt into options', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here you go.',
      prompt: { title: 'A Title', prompt: 'A prompt.' },
    });

    expect(parsed.options).toHaveLength(1);
  });

  test('drops out-of-vocabulary tags rather than losing the draft', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Drafted.',
      options: [
        {
          title: 'A Title',
          prompt: 'A prompt.',
          frqType: 'sonnet',
          difficulty: 'impossible',
        },
      ],
    });

    expect(parsed.options[0].prompt).toBe('A prompt.');
    expect(parsed.options[0].frqType).toBeUndefined();
    expect(parsed.options[0].difficulty).toBeUndefined();
  });

  test('rejects a response with no reply at all', () => {
    expect(GeneratorResponseSchema.safeParse({ options: [] }).success).toBe(
      false
    );
  });

  test('budgets enough output tokens for a full set of options', () => {
    expect(MAX_GENERATOR_OUTPUT_TOKENS).toBeGreaterThan(
      GENERATOR_OPTION_COUNT * 400
    );
  });
});
