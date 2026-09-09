import { describe, expect, test } from 'bun:test';

import {
  DAILY_PAGES_REFLECTION_CATEGORY_KEYS,
  DAILY_PAGES_REFLECTION_PROMPT_CONFIG,
  DAILY_PAGES_REFLECTION_RUBRIC,
  DAILY_PAGES_REFLECTION_SCORE_LABELS,
  DAILY_PAGES_REFLECTION_SCORING_SCALE,
} from './daily-pages-reflection-rubric';
import { CLASS_STARTER_RUBRIC } from './class-starter-rubric';
import {
  getCategoryScoreBand,
  getCategoryScoreLabel,
  isCategoryFeedbackEnabled,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

const categories = DAILY_PAGES_REFLECTION_RUBRIC.categories;

describe('the Daily Pages reflection rubric shape', () => {
  test('judges the three things a reflection is asked for', () => {
    expect(categories.map((category) => category.key)).toEqual([
      ...DAILY_PAGES_REFLECTION_CATEGORY_KEYS,
    ]);
    expect(categories).toHaveLength(3);
  });

  test('asks more of a student than the Class Starter does', () => {
    expect(categories.length).toBeGreaterThan(
      CLASS_STARTER_RUBRIC.categories.length
    );
    expect(DAILY_PAGES_REFLECTION_SCORING_SCALE.maxScore).toBeGreaterThan(3);
  });

  test('weights sum to one, so the composite is the weighted score', () => {
    const total = categories.reduce(
      (sum, category) => sum + category.weight,
      0
    );
    expect(Number(total.toFixed(4))).toBe(1);
  });

  test('scores each category 0-4 in whole steps', () => {
    expect(DAILY_PAGES_REFLECTION_SCORING_SCALE).toMatchObject({
      type: 'points_scale',
      minScore: 0,
      maxScore: 4,
      step: 1,
    });
    expect(
      DAILY_PAGES_REFLECTION_SCORE_LABELS.map((entry) => entry.value)
    ).toEqual([0, 1, 2, 3, 4]);
  });

  test('every category carries the shared words and a band for each score', () => {
    for (const category of categories) {
      expect(category.scoreLabels).toEqual(DAILY_PAGES_REFLECTION_SCORE_LABELS);
      for (const { value, label } of DAILY_PAGES_REFLECTION_SCORE_LABELS) {
        expect(getCategoryScoreLabel(category, value)).toBe(label);
        const band = getCategoryScoreBand(category, value);
        expect(band).not.toBeNull();
        expect(band?.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('gives feedback on each category, unlike the Class Starter', () => {
    for (const category of categories) {
      expect(isCategoryFeedbackEnabled(category)).toBe(true);
    }
    expect(isCategoryFeedbackEnabled(CLASS_STARTER_RUBRIC.categories[0])).toBe(
      false
    );
  });

  test('still never marks the writing up for grammar', () => {
    expect(resolveGrammarHighlightingEnabled(categories)).toBe(false);
  });
});

describe('the Daily Pages reflection grading instructions', () => {
  const instructions = (
    DAILY_PAGES_REFLECTION_PROMPT_CONFIG.gradingInstructions ?? ''
  ).toLowerCase();

  test('anchors the entry to the text or topic it was assigned about', () => {
    expect(instructions).toContain('assigned text');
    expect(instructions).toContain('specific');
  });

  test('asks for reflection past a first reaction', () => {
    expect(instructions).toContain('reflection');
    expect(instructions).toContain('first reaction');
  });

  test('names the higher bar so it is not graded like a class starter', () => {
    expect(instructions).toContain('class starter');
    expect(instructions).toContain('effort alone');
  });

  test('keeps grammar out of the score', () => {
    expect(instructions).toContain('do not mark grammar');
  });

  test('covers every rubric category by key', () => {
    for (const category of categories) {
      expect(instructions).toContain(category.label.toLowerCase());
    }
  });
});
