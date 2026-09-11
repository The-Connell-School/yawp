import { describe, expect, test } from 'bun:test';

import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY,
  DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORE_LABELS,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from './daily-pages-short-form-rubric';
import { CLASS_STARTER_RUBRIC } from './class-starter-rubric';
import { rubricCategories as essayCategories } from '~/domain/grading/rubric';
import {
  getCategoryScoreBand,
  getCategoryScoreLabel,
  isCategoryFeedbackEnabled,
  isGrammarHighlightCategory,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

const categories = DAILY_PAGES_SHORT_FORM_RUBRIC.categories;

describe('the Daily Pages short-form rubric shape', () => {
  test('judges thinking first, then the craft an essay is judged on', () => {
    expect(categories.map((category) => category.key)).toEqual([
      ...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
    ]);
    expect(categories).toHaveLength(5);
  });

  /**
   * The craft half of Daily Pages is the essay's craft. Three of its five
   * categories are the essay's own keys, so a teacher grading both sees the
   * same dimensions and a score means the same thing in either place.
   */
  test('reuses the essay rubric keys wherever the dimension is the same', () => {
    const essayKeys = new Set(essayCategories.map((category) => category.key));

    for (const key of [
      'organization_and_structure',
      'voice_and_style',
      'grammar_and_mechanics',
    ] as const) {
      expect(essayKeys.has(key)).toBe(true);
      expect(categories.some((category) => category.key === key)).toBe(true);
    }
  });

  test('weights sum to one, so the composite is the weighted score', () => {
    const total = categories.reduce((sum, c) => sum + c.weight, 0);
    expect(Number(total.toFixed(4))).toBe(1);
  });

  /**
   * Thinking is what this assignment is for. Craft and correctness are graded
   * and carry real weight, but they cannot outweigh what the student actually
   * thought — a clean, well-ordered piece with nothing in it is not a good
   * Daily Pages entry.
   */
  test('weights thinking above craft', () => {
    const weightOf = (key: string) =>
      categories.find((category) => category.key === key)?.weight ?? 0;

    const thinking =
      weightOf('depth_of_thought') + weightOf('development_of_thought');

    expect(thinking).toBeGreaterThan(0.5);
  });

  test('scores on the same 1-5 scale the essay uses', () => {
    expect(DAILY_PAGES_SHORT_FORM_SCORING_SCALE).toMatchObject({
      type: 'weighted_1_5',
      minScore: 1,
      maxScore: 5,
      step: 1,
    });
    expect(
      DAILY_PAGES_SHORT_FORM_SCORE_LABELS.map((entry) => entry.value)
    ).toEqual([1, 2, 3, 4, 5]);
  });

  test('every category carries the shared words and a band for each score', () => {
    for (const category of categories) {
      expect(category.scoreLabels).toEqual(DAILY_PAGES_SHORT_FORM_SCORE_LABELS);
      for (const { value, label } of DAILY_PAGES_SHORT_FORM_SCORE_LABELS) {
        expect(getCategoryScoreLabel(category, value)).toBe(label);
        const band = getCategoryScoreBand(category, value);
        expect(band).not.toBeNull();
        expect(band?.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('gives feedback on every category, unlike the Class Starter', () => {
    for (const category of categories) {
      expect(isCategoryFeedbackEnabled(category)).toBe(true);
    }
    expect(isCategoryFeedbackEnabled(CLASS_STARTER_RUBRIC.categories[0])).toBe(
      false
    );
  });
});

/**
 * The sharpest line between the two assistants. A Class Starter is never marked
 * up; a Daily Pages entry is graded for grammar and syntax the way an essay is.
 */
describe('grammar is graded, which is what Class Starter never does', () => {
  test('marks the writing up for grammar and syntax', () => {
    expect(resolveGrammarHighlightingEnabled(categories)).toBe(true);
    expect(resolveGrammarHighlightingEnabled(CLASS_STARTER_RUBRIC.categories)).toBe(
      false
    );
  });

  test('highlighting comes from the grammar category and only that one', () => {
    const highlighting = categories.filter(isGrammarHighlightCategory);

    expect(highlighting.map((category) => category.key)).toEqual([
      DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY,
    ]);
  });

  test('carries real weight rather than being a token category', () => {
    const grammar = categories.find(
      (category) => category.key === DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY
    );

    expect(grammar?.weight).toBeGreaterThan(0.1);
  });
});

describe('the Daily Pages short-form grading instructions', () => {
  const instructions = (
    DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG.gradingInstructions ?? ''
  ).toLowerCase();

  test('says to grade grammar, syntax and mechanics', () => {
    expect(instructions).toContain('grammar');
    expect(instructions).toContain('syntax');
    expect(instructions).not.toContain('do not grade grammar');
    expect(instructions).not.toContain('do not mark grammar');
  });

  test('grades it like an essay, scaled to its length', () => {
    expect(instructions).toContain('essay');
    expect(instructions).toContain('short');
  });

  test('asks for thinking that goes past a first reaction and develops', () => {
    expect(instructions).toContain('depth of thought');
    expect(instructions).toContain('development of thought');
    expect(instructions).toContain('first reaction');
  });

  /** Not "did they write something", which is the Class Starter question. */
  test('rules out crediting mere presence on the page', () => {
    expect(instructions).toContain('showing up');
  });

  test('does not penalize the piece for being short', () => {
    expect(instructions).toContain('length');
  });

  test('names the higher bar so it is not graded like a class starter', () => {
    expect(instructions).toContain('class starter');
    expect(instructions).toContain('effort alone');
  });

  test('covers every rubric category by label', () => {
    for (const category of categories) {
      expect(instructions).toContain(category.label.toLowerCase());
    }
  });
});
