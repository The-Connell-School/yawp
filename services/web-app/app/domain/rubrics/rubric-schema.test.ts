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
    expect(names).toEqual([
      'thesis-driven-essay',
      'daily-pages-engagement',
      'gba300-international-expansion',
      'gba300-international-etiquette',
    ]);

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

    const expansion = STARTER_RUBRICS[2];
    expect(expansion.rubric.categories).toHaveLength(9);
    expect(expansion.rubric.categories.map((category) => category.weight)).toEqual([
      0.1,
      0.1,
      0.2,
      0.2,
      0.05,
      0.05,
      0.1,
      0.1,
      0.1,
    ]);
    expect(expansion.rubric.categories[0].bands?.at(-1)?.max).toBe(10);
    expect(expansion.rubric.categories[2].bands?.at(-1)?.max).toBe(20);

    const etiquette = STARTER_RUBRICS[3];
    expect(etiquette.rubric.categories.map((category) => category.key)).toEqual([
      'introduction',
      'country_1_its_two_topics',
      'country_2_its_two_topics',
      'conclusion',
    ]);
    expect(
      etiquette.rubric.categories.some((category) =>
        category.key.includes('deduction')
      )
    ).toBe(false);
    expect(etiquette.promptConfig.gradingInstructions).toContain(
      'never applies a deduction'
    );
  });
});
