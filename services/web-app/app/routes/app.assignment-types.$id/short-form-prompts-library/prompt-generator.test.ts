import { describe, expect, test } from 'bun:test';

import {
  GENERATOR_OPTION_COUNT,
  GeneratorResponseSchema,
  buildShortFormGeneratorSystemPrompt,
  selectFewShotExamples,
} from './prompt-generator';
import { KIND_ORDER, type ShortFormPrompt } from './data';
import promptsRaw from './prompts.json';
import { buildGeneratorSystemPrompt } from '../prompts-library/prompt-generator';
import freewriteRaw from '../prompts-library/prompts.json';
import type { LibraryPrompt } from '../prompts-library/data';

const prompts = promptsRaw as ShortFormPrompt[];
const systemPrompt = buildShortFormGeneratorSystemPrompt(prompts);

describe('selectFewShotExamples', () => {
  test('shows the model one example of every kind', () => {
    const kinds = selectFewShotExamples(prompts).map((p) => p.kind);
    expect(new Set(kinds).size).toBe(KIND_ORDER.length);
  });

  test('is deterministic, so the system prompt stays cacheable', () => {
    expect(selectFewShotExamples(prompts).map((p) => p.id)).toEqual(
      selectFewShotExamples(prompts).map((p) => p.id)
    );
  });

  test('prefers examples that vary the source need', () => {
    const needs = selectFewShotExamples(prompts).map((p) => p.sourceNeed);
    expect(new Set(needs).size).toBeGreaterThan(1);
  });
});

describe('the short-form generator system prompt', () => {
  /**
   * The reason this generator exists rather than reusing the Class Starter one.
   * A draft that stops at an invitation is unusable here: the rubric scores
   * Development of Thought, and there is nothing to read if the prompt never
   * asked for the backing.
   */
  test('requires every draft to ask for the support', () => {
    const lower = systemPrompt.toLowerCase();

    expect(lower).toContain('backing');
    expect(lower).toContain('reason');
    expect(lower).toContain('never');
  });

  test('says the writing is graded, and graded on grammar too', () => {
    const lower = systemPrompt.toLowerCase();

    expect(lower).toContain('graded');
    expect(lower).toContain('grammar');
  });

  test('names the length target, since the rubric will not reward length', () => {
    expect(systemPrompt.toLowerCase()).toContain('length');
  });

  test('rules out the two shapes on either side of it', () => {
    const lower = systemPrompt.toLowerCase();

    expect(lower).toContain('class starter');
    expect(lower).toContain('thesis');
  });

  test('teaches the tagging vocabulary the library filters on', () => {
    for (const kind of KIND_ORDER) {
      expect(systemPrompt).toContain(kind);
    }
    for (const value of ['required', 'optional', 'none']) {
      expect(systemPrompt).toContain(value);
    }
    for (const value of ['paragraph', 'half-page', 'page']) {
      expect(systemPrompt).toContain(value);
    }
  });

  test('pins the model to the JSON contract', () => {
    expect(systemPrompt).toContain('STRICT JSON');
    expect(systemPrompt).toContain(String(GENERATOR_OPTION_COUNT));
  });

  /**
   * The failure this replaces: pointing the Class Starter generator at Daily
   * Pages would have kept producing effort-based freewrites under a new label.
   */
  test('is not the Class Starter generator with a new name', () => {
    const freewrite = buildGeneratorSystemPrompt(
      freewriteRaw as LibraryPrompt[]
    );

    expect(systemPrompt).not.toBe(freewrite);

    // The Class Starter generator describes the thing it is drafting as an
    // effort-based freewrite. This one describes it as graded, and names the
    // freewrite only to rule it out — so the phrase may appear, but only after
    // "not a Class Starter".
    expect(freewrite.toLowerCase()).toContain('effort-based freewrite');

    const lower = systemPrompt.toLowerCase();
    const rulesOutAt = lower.indexOf('not a class starter');
    expect(rulesOutAt).toBeGreaterThan(-1);
    expect(lower.indexOf('effort-based')).toBeGreaterThan(rulesOutAt);

    // And it must never tell the model its own output is ungraded.
    expect(lower).not.toContain('never about correctness');
  });
});

describe('GeneratorResponseSchema', () => {
  test('keeps a draft whose tags are all in the vocabulary', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Here are three.',
      options: [
        {
          prompt: 'Take a position and give the reason that most tests it.',
          kind: 'claim-and-defend',
          sourceNeed: 'none',
          lengthTarget: 'paragraph',
          cognitiveMoves: ['argue-a-position'],
        },
      ],
    });

    expect(parsed.options).toHaveLength(1);
    expect(parsed.options[0].kind).toBe('claim-and-defend');
  });

  /** A bad tag must cost the tag, never the draft. */
  test('drops an out-of-vocabulary tag rather than the whole draft', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'One draft.',
      options: [
        {
          prompt: 'Defend a claim and give one specific reason.',
          kind: 'not-a-kind',
          sourceNeed: 'sometimes',
          lengthTarget: 'epic',
        },
      ],
    });

    expect(parsed.options).toHaveLength(1);
    expect(parsed.options[0].kind).toBeUndefined();
    expect(parsed.options[0].sourceNeed).toBeUndefined();
    expect(parsed.options[0].lengthTarget).toBeUndefined();
  });

  test('coerces an older singular response into options', () => {
    const parsed = GeneratorResponseSchema.parse({
      reply: 'Just one.',
      prompt: { prompt: 'Name the one difference that matters, and why.' },
    });

    expect(parsed.options).toHaveLength(1);
  });

  test('accepts a clarifying turn that drafts nothing', () => {
    expect(
      GeneratorResponseSchema.parse({ reply: 'Which text?' }).options
    ).toEqual([]);
  });
});
