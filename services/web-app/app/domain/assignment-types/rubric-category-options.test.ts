import { describe, expect, test } from 'bun:test';
import {
  getCategoryScoreBounds,
  getCategoryScoreLabel,
  isScoreInCategoryBands,
  isCategoryFeedbackEnabled,
  isGrammarHighlightCategory,
  parseRubricScoreLabels,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

describe('category-specific band score ranges', () => {
  const category = {
    key: 'introduction',
    bands: [
      { min: 0, max: 0, label: 'Absent', description: 'Missing.' },
      { min: 1, max: 2, label: 'Struggling', description: 'Incomplete.' },
      { min: 3, max: 3, label: 'Developing', description: 'Generic.' },
      { min: 4, max: 4, label: 'Proficient', description: 'Clear.' },
      { min: 5, max: 5, label: 'Exemplary', description: 'Purposeful.' },
    ],
  };

  test('derives the raw point bounds from the declared bands', () => {
    expect(getCategoryScoreBounds(category)).toEqual({ min: 0, max: 5 });
  });

  test('accepts only scores covered by a declared band', () => {
    expect(isScoreInCategoryBands(category, 0)).toBe(true);
    expect(isScoreInCategoryBands(category, 5)).toBe(true);
    expect(isScoreInCategoryBands(category, 6)).toBe(false);
  });
});

describe('isCategoryFeedbackEnabled', () => {
  test('defaults to enabled when the category says nothing', () => {
    expect(isCategoryFeedbackEnabled({ key: 'thesis' })).toBe(true);
  });

  test('stays enabled when explicitly true', () => {
    expect(
      isCategoryFeedbackEnabled({ key: 'thesis', feedbackEnabled: true })
    ).toBe(true);
  });

  test('is disabled only when explicitly false', () => {
    expect(
      isCategoryFeedbackEnabled({ key: 'thesis', feedbackEnabled: false })
    ).toBe(false);
  });
});

describe('isGrammarHighlightCategory', () => {
  test('falls back to the legacy grammar keys when no flag is set', () => {
    expect(isGrammarHighlightCategory({ key: 'grammar_and_mechanics' })).toBe(
      true
    );
    expect(
      isGrammarHighlightCategory({ key: 'language_use_and_conventions' })
    ).toBe(true);
    expect(isGrammarHighlightCategory({ key: 'thesis_and_content' })).toBe(
      false
    );
  });

  test('an explicit flag wins over the legacy key match', () => {
    expect(
      isGrammarHighlightCategory({
        key: 'grammar_and_mechanics',
        grammarHighlighting: false,
      })
    ).toBe(false);
    expect(
      isGrammarHighlightCategory({
        key: 'syntax_and_style',
        grammarHighlighting: true,
      })
    ).toBe(true);
  });
});

describe('resolveGrammarHighlightingEnabled', () => {
  test('stays on for rubrics that predate the flag', () => {
    expect(
      resolveGrammarHighlightingEnabled([
        { key: 'thesis_and_content' },
        { key: 'grammar_and_mechanics' },
      ])
    ).toBe(true);
  });

  test('stays on for a custom rubric with no grammar-looking category', () => {
    expect(
      resolveGrammarHighlightingEnabled([
        { key: 'daily_habit' },
        { key: 'reflection' },
      ])
    ).toBe(true);
  });

  test('is off when every category explicitly opts out', () => {
    expect(
      resolveGrammarHighlightingEnabled([
        { key: 'daily_habit', grammarHighlighting: false },
        { key: 'reflection', grammarHighlighting: false },
      ])
    ).toBe(false);
  });

  test('is on when at least one category opts in', () => {
    expect(
      resolveGrammarHighlightingEnabled([
        { key: 'daily_habit', grammarHighlighting: false },
        { key: 'syntax_and_style', grammarHighlighting: true },
      ])
    ).toBe(true);
  });

  test('is off for an empty category list only when the list is empty of opt-ins', () => {
    expect(resolveGrammarHighlightingEnabled([])).toBe(true);
  });
});

describe('parseRubricScoreLabels', () => {
  test('returns undefined for anything that is not a populated array', () => {
    expect(parseRubricScoreLabels(undefined)).toBeUndefined();
    expect(parseRubricScoreLabels(null)).toBeUndefined();
    expect(parseRubricScoreLabels('1 - Great')).toBeUndefined();
    expect(parseRubricScoreLabels([])).toBeUndefined();
  });

  test('keeps well-formed entries and drops malformed ones', () => {
    expect(
      parseRubricScoreLabels([
        { value: 1, label: 'Not yet' },
        { value: 2, label: '   ' },
        { value: 'three', label: 'Nope' },
        { value: 3, label: ' Solid ' },
      ])
    ).toEqual([
      { value: 1, label: 'Not yet' },
      { value: 3, label: 'Solid' },
    ]);
  });

  test('returns undefined when nothing survives parsing', () => {
    expect(parseRubricScoreLabels([{ value: 'x', label: '' }])).toBeUndefined();
  });
});

describe('getCategoryScoreLabel', () => {
  test('returns null when the category has no labels', () => {
    expect(getCategoryScoreLabel({ key: 'thesis' }, 3)).toBeNull();
  });

  test('returns the label for a matching score value', () => {
    const category = {
      key: 'thesis',
      scoreLabels: [
        { value: 1, label: 'Not yet' },
        { value: 3, label: 'Solid' },
      ],
    };
    expect(getCategoryScoreLabel(category, 3)).toBe('Solid');
    expect(getCategoryScoreLabel(category, 2)).toBeNull();
  });
});
