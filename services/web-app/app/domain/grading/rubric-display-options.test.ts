import { describe, expect, test } from 'bun:test';
import {
  applyDisplayGrammarCategories,
  resolveDisplayOptions,
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

  test('assignment grammar off wins', () => {
    expect(
      resolveDisplayOptions(
        { display: { grammarHighlight: 'highlight' } },
        thesisCategories,
        { grammarGradingEnabled: false }
      ).grammarHighlight
    ).toBe('off');
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
