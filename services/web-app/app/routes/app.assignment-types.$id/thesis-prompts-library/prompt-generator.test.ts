import { describe, expect, test } from 'bun:test';
import {
  buildGeneratorSystemPrompt,
  GeneratorResponseSchema,
  resolveGeneratorModel,
  selectFewShotExamples,
} from './prompt-generator';
import type { ThesisPrompt } from './data';
import promptsRaw from './prompts.json';

const ALL_PROMPTS = promptsRaw as ThesisPrompt[];

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
  test('picks a category-diverse, deterministic set from the corpus', () => {
    const first = selectFewShotExamples(ALL_PROMPTS);
    const second = selectFewShotExamples(ALL_PROMPTS);
    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));

    const categories = new Set(first.map((p) => p.category));
    // At least three distinct categories are represented so the model sees the
    // house style across prompt kinds (theme, single-text, general, …).
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });
});

describe('buildGeneratorSystemPrompt', () => {
  const system = buildGeneratorSystemPrompt(ALL_PROMPTS);

  test('encodes the three-part house style', () => {
    expect(system).toContain('thesis-driven critical essay');
    expect(system).toContain('find your own angle');
    expect(system).toContain('emotional charge');
    expect(system).toContain(
      'introduction, thesis statement, body paragraphs, and a conclusion'
    );
  });

  test('pins the JSON output contract with multiple options', () => {
    expect(system).toContain('STRICT JSON ONLY');
    expect(system).toContain('"reply"');
    expect(system).toContain('"options"');
    // The teacher wants a real choice, so it must ask for several distinct drafts.
    expect(system).toContain('distinct');
  });

  test('asks for short, lively, skimmable replies (no walls of text)', () => {
    expect(system.toLowerCase()).toContain('skimmable');
    expect(system).toContain('**bold**');
    expect(system).toContain('bullet');
  });

  test('includes at least one real corpus prompt as a few-shot example', () => {
    const example = selectFewShotExamples(ALL_PROMPTS)[0];
    expect(system).toContain(example.title);
  });
});

describe('GeneratorResponseSchema', () => {
  test('accepts a reply with several drafted options', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here are three drafts you can tweak.',
      options: [
        { title: 'Ambition and Its Costs', body: 'Write a…' },
        { title: 'The Price of Power', body: 'Write a…' },
        { title: 'Who Pays for Ambition', body: 'Write a…' },
      ],
    });
    expect(parsed.options).toHaveLength(3);
    expect(parsed.options[0].title).toBe('Ambition and Its Costs');
  });

  test('normalizes missing options to an empty array', () => {
    expect(
      GeneratorResponseSchema.parse({ reply: 'What grade level?' }).options
    ).toEqual([]);
    expect(
      GeneratorResponseSchema.parse({ reply: 'What text?', options: [] }).options
    ).toEqual([]);
  });

  test('coerces a legacy singular prompt into options', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here is a draft.',
      prompt: { title: 'Fate and Free Will', body: 'Write a…' },
    });
    expect(parsed.options).toHaveLength(1);
    expect(parsed.options[0].title).toBe('Fate and Free Will');
  });

  test('rejects an empty reply or an incomplete option object', () => {
    expect(GeneratorResponseSchema.safeParse({ reply: '' }).success).toBe(false);
    expect(
      GeneratorResponseSchema.safeParse({
        reply: 'ok',
        options: [{ title: 'x' }],
      }).success
    ).toBe(false);
  });
});
