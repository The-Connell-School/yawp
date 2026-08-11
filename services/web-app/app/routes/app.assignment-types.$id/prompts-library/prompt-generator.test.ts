import { describe, expect, test } from 'bun:test';
import {
  buildGeneratorSystemPrompt,
  GENERATOR_OPTION_COUNT,
  GeneratorResponseSchema,
  MAX_GENERATOR_OUTPUT_TOKENS,
  resolveGeneratorModel,
  selectFewShotExamples,
} from './prompt-generator';
import type { LibraryPrompt } from './data';
import promptsRaw from './prompts.json';

const ALL_PROMPTS = promptsRaw as LibraryPrompt[];

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
  test('picks a type-diverse, deterministic set from the corpus', () => {
    const first = selectFewShotExamples(ALL_PROMPTS);
    const second = selectFewShotExamples(ALL_PROMPTS);
    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));

    // Every prompt type in the corpus is represented, so the model sees the
    // full range of shapes a Daily Pages prompt can take.
    const types = new Set(first.map((p) => p.type));
    expect(types.size).toBeGreaterThanOrEqual(5);
  });

  test('spans the seriousness range so drafts are not all heavy', () => {
    const seriousness = new Set(
      selectFewShotExamples(ALL_PROMPTS).map((p) => p.seriousness)
    );
    expect(seriousness.size).toBeGreaterThanOrEqual(3);
  });
});

describe('buildGeneratorSystemPrompt', () => {
  const system = buildGeneratorSystemPrompt(ALL_PROMPTS);

  test('encodes the Daily Pages house style: short, provocative, no scaffolding', () => {
    expect(system).toContain('Daily Pages');
    expect(system.toLowerCase()).toContain('one or two sentences');
    // Daily Pages is effort-based freewriting, not a formal essay.
    expect(system.toLowerCase()).toContain('thesis');
    expect(system.toLowerCase()).toContain('rubric');
    expect(system.toLowerCase()).toContain('word count');
  });

  test('teaches the facet vocabulary it must tag drafts with', () => {
    expect(system).toContain('agree-disagree');
    expect(system).toContain('open-reflection');
    expect(system).toContain('narrative-anchor');
    expect(system).toContain('take-a-stance');
    expect(system).toContain('playful');
  });

  test('pins the JSON output contract with multiple options', () => {
    expect(system).toContain('STRICT JSON ONLY');
    expect(system).toContain('"reply"');
    expect(system).toContain('"options"');
    expect(system).toContain(String(GENERATOR_OPTION_COUNT));
    // The teacher wants a real choice, so it must ask for distinct drafts.
    expect(system).toContain('distinct');
  });

  test('asks for short, lively, skimmable replies (no walls of text)', () => {
    expect(system.toLowerCase()).toContain('skimmable');
    expect(system).toContain('**bold**');
    expect(system).toContain('bullet');
  });

  test('includes real corpus prompts as few-shot examples', () => {
    const examples = selectFewShotExamples(ALL_PROMPTS);
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(system).toContain(example.prompt);
    }
  });
});

describe('MAX_GENERATOR_OUTPUT_TOKENS', () => {
  test('leaves room for a reply plus every option without truncating the JSON', () => {
    // Daily Pages drafts are one-liners, but the JSON must never be cut off
    // mid-object — that is what leaks raw JSON into the chat.
    expect(MAX_GENERATOR_OUTPUT_TOKENS).toBeGreaterThanOrEqual(1500);
  });
});

describe('GeneratorResponseSchema', () => {
  test('accepts a reply with several drafted options', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here are three angles on ambition.',
      options: [
        { prompt: 'Ambition costs something. What?' },
        { prompt: 'Wanting more is human. Agree or disagree.' },
        { prompt: 'Name the last thing you wanted badly. Was it worth it?' },
      ],
    });
    expect(parsed.options).toHaveLength(3);
    expect(parsed.options[0].prompt).toBe('Ambition costs something. What?');
  });

  test('keeps facet tags the model supplies from the controlled vocabulary', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'One draft.',
      options: [
        {
          prompt: 'You become who you spend time with. Defend or reject this.',
          type: 'agree-disagree',
          seriousness: 'moderate',
          cognitiveMoves: ['take-a-stance', 'introspect'],
        },
      ],
    });
    expect(parsed.options[0]).toMatchObject({
      type: 'agree-disagree',
      seriousness: 'moderate',
      cognitiveMoves: ['take-a-stance', 'introspect'],
    });
  });

  test('drops facet tags outside the vocabulary rather than failing the draft', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'One draft.',
      options: [
        {
          prompt: 'What do you owe the people who raised you?',
          type: 'reflection-ish',
          seriousness: 'very-serious',
          cognitiveMoves: ['ponder'],
        },
      ],
    });
    // The prompt itself is what matters; a bad tag must not lose the draft.
    expect(parsed.options[0].prompt).toBe(
      'What do you owe the people who raised you?'
    );
    expect(parsed.options[0].type).toBeUndefined();
    expect(parsed.options[0].seriousness).toBeUndefined();
    expect(parsed.options[0].cognitiveMoves).toBeUndefined();
  });

  test('normalizes missing options to an empty array', () => {
    expect(
      GeneratorResponseSchema.parse({ reply: 'What grade level?' }).options
    ).toEqual([]);
    expect(
      GeneratorResponseSchema.parse({ reply: 'What text?', options: [] })
        .options
    ).toEqual([]);
  });

  test('coerces a legacy singular prompt object into options', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here is a draft.',
      prompt: { prompt: 'Is loyalty ever a mistake?' },
    });
    expect(parsed.options).toHaveLength(1);
    expect(parsed.options[0].prompt).toBe('Is loyalty ever a mistake?');
  });

  test('rejects an empty reply or an option with no prompt text', () => {
    expect(GeneratorResponseSchema.safeParse({ reply: '' }).success).toBe(false);
    expect(
      GeneratorResponseSchema.safeParse({
        reply: 'ok',
        options: [{ type: 'provocation' }],
      }).success
    ).toBe(false);
  });
});
