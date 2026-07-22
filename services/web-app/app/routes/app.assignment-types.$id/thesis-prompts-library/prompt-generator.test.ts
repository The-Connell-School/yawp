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

  test('pins the JSON output contract', () => {
    expect(system).toContain('STRICT JSON ONLY');
    expect(system).toContain('"reply"');
    expect(system).toContain('"prompt"');
  });

  test('includes at least one real corpus prompt as a few-shot example', () => {
    const example = selectFewShotExamples(ALL_PROMPTS)[0];
    expect(system).toContain(example.title);
  });
});

describe('GeneratorResponseSchema', () => {
  test('accepts a reply with a drafted prompt', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here is a draft you can tweak.',
      prompt: { title: 'Ambition and Its Costs', body: 'Write a…' },
    });
    expect(parsed.prompt?.title).toBe('Ambition and Its Costs');
  });

  test('normalizes a missing or null prompt to null', () => {
    expect(GeneratorResponseSchema.parse({ reply: 'What grade level?' }).prompt).toBeNull();
    expect(
      GeneratorResponseSchema.parse({ reply: 'What text?', prompt: null }).prompt
    ).toBeNull();
  });

  test('rejects an empty reply or an incomplete prompt object', () => {
    expect(GeneratorResponseSchema.safeParse({ reply: '' }).success).toBe(false);
    expect(
      GeneratorResponseSchema.safeParse({
        reply: 'ok',
        prompt: { title: 'x' },
      }).success
    ).toBe(false);
  });
});
