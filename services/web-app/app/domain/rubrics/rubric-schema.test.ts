import { describe, expect, test } from 'bun:test';

import {
  formatRubricSchema,
  parseRubricSchema,
  suggestRubricIdentity,
} from './rubric-schema';
import { STARTER_RUBRICS } from './starter-rubrics';

const minimal = {
  name: 'gba-etiquette',
  title: "GBA 300: Int'l Etiquette",
  rubric: {
    categories: [
      { key: 'claim', label: 'Claim', description: 'A claim.', weight: 1 },
    ],
  },
};

describe('rubric schema', () => {
  test('accepts a rubric with only a name and categories', () => {
    const result = parseRubricSchema(minimal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schema.name).toBe('gba-etiquette');
    expect(result.schema.rubric.categories).toHaveLength(1);
    // The parts a hand-written rubric leaves out get the usual defaults
    // rather than being treated as errors.
    expect(result.schema.outputSchema).toMatchObject({
      responseShape: 'categories_overall_comment',
    });
    expect(result.schema.scoringScale.maxScore).toBeGreaterThan(0);
  });

  test('reads categories at the top level as well as nested', () => {
    const result = parseRubricSchema({
      name: 'flat',
      categories: minimal.rubric.categories,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schema.rubric.categories).toHaveLength(1);
  });

  test('refuses a rubric with no categories', () => {
    const result = parseRubricSchema({
      name: 'empty',
      rubric: { categories: [] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('category');
  });

  test('refuses anything that is not an object', () => {
    expect(parseRubricSchema('nope').ok).toBe(false);
    expect(parseRubricSchema([]).ok).toBe(false);
    expect(parseRubricSchema(null).ok).toBe(false);
  });

  test('derives a name from the title when the JSON does not carry one', () => {
    expect(
      suggestRubricIdentity({ title: "GBA 300: Int'l Etiquette" })
    ).toEqual({
      name: 'gba-300-int-l-etiquette',
      title: "GBA 300: Int'l Etiquette",
    });
  });

  test('round-trips: what is shown can be pasted back in', () => {
    for (const starter of STARTER_RUBRICS) {
      const formatted = formatRubricSchema(starter);
      const reparsed = parseRubricSchema(JSON.parse(formatted));

      expect(reparsed.ok).toBe(true);
      if (!reparsed.ok) continue;
      expect(reparsed.schema.name).toBe(starter.name);
      expect(reparsed.schema.rubric.categories.length).toBe(
        starter.rubric.categories.length
      );
    }
  });

  test('the starter rubrics are the ones production already grades with', () => {
    const names = STARTER_RUBRICS.map((rubric) => rubric.name);
    expect(names).toEqual(['thesis-driven-essay', 'daily-pages-engagement']);

    const thesis = STARTER_RUBRICS[0];
    expect(thesis.rubric.categories).toHaveLength(5);
    expect(thesis.scoringScale).toMatchObject({
      type: 'weighted_1_5',
      minScore: 1,
      maxScore: 5,
    });
    expect(thesis.promptConfig).toEqual({
      instructionsPreset: 'legacy_thesis_driven_essay',
    });
    expect(
      thesis.rubric.categories.every((category) => category.bands === undefined)
    ).toBe(true);

    // Production scores Daily Pages out of 30 in steps of ten, which is not
    // what the built-in Daily Pages default does.
    const dailyPages = STARTER_RUBRICS[1];
    expect(dailyPages.scoringScale).toMatchObject({
      minScore: 0,
      maxScore: 30,
      step: 10,
    });
    expect(dailyPages.rubric.categories[0].key).toBe('engagement_with_prompt');
    expect(dailyPages.rubric.categories[0].scoreLabels).toEqual([
      { value: 0, label: 'NOT HANDED IN' },
      { value: 10, label: 'HARDLY THERE' },
      { value: 20, label: 'SHOWED UP' },
      { value: 30, label: 'ALL IN' },
    ]);
    expect(dailyPages.rubric.categories[0].grammarHighlighting).toBe(false);
  });
});
