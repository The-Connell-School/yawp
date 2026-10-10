import { describe, expect, test } from 'bun:test';
import { getThesisDefaultRubricConfig } from '~/domain/assignment-types/assignment-type-rubric-config';
import {
  applyDisplayGrammarCategories,
  resolveDisplayOptions,
  shouldRunGrammarChecker,
} from './rubric-display-options';

const thesisCategories = [
  {
    key: 'thesis_and_content',
    label: 'Thesis',
    description: 'Thesis.',
    weight: 0.6,
    grammarHighlighting: false,
  },
  {
    key: 'language_use_and_conventions',
    label: 'Language',
    description: 'Grammar.',
    weight: 0.4,
    grammarHighlighting: true,
  },
];

describe('resolveDisplayOptions', () => {
  test('defaults reproduce legacy behavior', () => {
    expect(
      resolveDisplayOptions({}, thesisCategories, {})
    ).toMatchObject({
      showCategories: true,
      perCategoryComments: true,
      grammarHighlight: 'deduct',
      teacherNotes: true,
    });
  });

  test('showCategories false forces perCategoryComments false', () => {
    expect(
      resolveDisplayOptions(
        { display: { showCategories: false, perCategoryComments: true } },
        thesisCategories,
        {}
      ).perCategoryComments
    ).toBe(false);
  });

  test('assignment grammar off wins when display explicitly sets grammarHighlight', () => {
    expect(
      resolveDisplayOptions(
        { display: { grammarHighlight: 'highlight' } },
        thesisCategories,
        { grammarGradingEnabled: false }
      ).grammarHighlight
    ).toBe('off');
  });

  test('thesis-driven essay with grammar toggle off still runs the checker when display is unset', () => {
    const thesis = getThesisDefaultRubricConfig();
    const display = resolveDisplayOptions(
      thesis.outputSchema,
      thesis.rubric.categories,
      { grammarGradingEnabled: false }
    );
    const filtered = applyDisplayGrammarCategories(
      thesis.rubric.categories,
      thesis.outputSchema,
      { grammarGradingEnabled: false }
    );

    expect(display.grammarHighlight).toBe('deduct');
    expect(
      shouldRunGrammarChecker(display, filtered, thesis.outputSchema)
    ).toBe(true);
  });
});

describe('applyDisplayGrammarCategories', () => {
  test('removes grammar categories only when grammar is explicitly off', () => {
    const explicit = applyDisplayGrammarCategories(
      thesisCategories,
      { display: { grammarHighlight: 'off' } },
      {}
    );
    expect(explicit.map((category) => category.key)).toEqual([
      'thesis_and_content',
    ]);

    const derivedOff = applyDisplayGrammarCategories(
      [{ ...thesisCategories[0], grammarHighlighting: false }],
      {},
      {}
    );
    expect(derivedOff).toHaveLength(1);
    expect(derivedOff[0].key).toBe('thesis_and_content');
  });
});
