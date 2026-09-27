import { describe, expect, test } from 'bun:test';

import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORE_LABELS,
} from '~/domain/assignment-types/daily-pages-short-form-rubric';

import {
  ABOUT_LEDE,
  GRADING_SUMMARY,
  PROMPT_RECIPE,
  PROMPT_REWRITES,
  PROMPT_WARNINGS,
  SCORE_SCALE_LABELS,
  WHAT_IT_IS,
  WHAT_IT_IS_NOT,
  HOW_TO_USE,
  REGISTER_NOTE,
} from './content';

const allCopy = () =>
  [
    ABOUT_LEDE,
    ...WHAT_IT_IS,
    ...WHAT_IT_IS_NOT.map((item) => `${item.claim} ${item.detail}`),
    ...HOW_TO_USE,
    REGISTER_NOTE,
    ...PROMPT_RECIPE.map((part) => `${part.move} ${part.detail}`),
  ].join(' ');

/**
 * Daily Pages is short academic paragraph practice, and the paragraph can be
 * of more than one kind. The page must say so, and must not tell a teacher that
 * every entry opens with a claim.
 */
describe('paragraph practice, in more than one kind', () => {
  test('opens by calling it paragraph practice', () => {
    expect(ABOUT_LEDE).toContain('paragraph practice');
  });

  test('says the teacher sets the time, rather than fixing it', () => {
    expect(ABOUT_LEDE).toMatch(/you set|you choose/i);
  });

  test('names the kinds of paragraph a teacher can ask for', () => {
    const text = WHAT_IT_IS.join(' ').toLowerCase();
    for (const move of [
      'analyz',
      'argu',
      'compar',
      'defin',
      'interpret',
      'evaluat',
      'synthesiz',
    ]) {
      expect(text).toContain(move);
    }
  });

  test('never pins the claim to the first sentence', () => {
    const text = allCopy().toLowerCase();
    expect(text).not.toContain('first sentence');
    expect(text).not.toContain('claim-first');
  });

  test('says what separates it from a Class Starter: a deliberate academic move', () => {
    const classStarter = WHAT_IT_IS_NOT.find((item) =>
      item.detail.includes('Class Starter')
    );
    expect(classStarter?.detail).toContain('deliberate');
    expect(classStarter?.detail).toContain('lower-stakes');
  });
});

describe('the grading summary', () => {
  test('describes exactly the rubric’s categories, in rubric order', () => {
    expect(GRADING_SUMMARY.map((row) => row.key)).toEqual([
      ...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
    ]);
  });

  test('reads its labels and weights off the rubric rather than restating them', () => {
    for (const category of DAILY_PAGES_SHORT_FORM_RUBRIC.categories) {
      const row = GRADING_SUMMARY.find((entry) => entry.key === category.key);
      expect(row).toBeDefined();
      expect(row?.label).toBe(category.label);
      expect(row?.weightPercent).toBe(Math.round(category.weight * 100));
    }
  });

  test('adds up to the whole score, so a teacher reading it sees all of it', () => {
    const total = GRADING_SUMMARY.reduce(
      (sum, row) => sum + row.weightPercent,
      0
    );
    expect(total).toBe(100);
  });

  test('puts the two thinking categories above craft, which is the point of the type', () => {
    const weightOf = (key: string) =>
      GRADING_SUMMARY.find((row) => row.key === key)?.weightPercent ?? 0;
    const thinking =
      weightOf('depth_of_thought') + weightOf('development_of_thought');
    expect(thinking).toBeGreaterThan(50);
  });

  test('tells a teacher grammar is scored on the AP standard', () => {
    const grammar = GRADING_SUMMARY.find(
      (row) => row.key === 'grammar_and_mechanics'
    );
    expect(grammar?.gloss).toContain('AP standard');
    expect(grammar?.gloss).toContain('distract from meaning');
  });

  test('glosses every category', () => {
    for (const row of GRADING_SUMMARY) {
      expect(row.gloss.length).toBeGreaterThan(20);
    }
  });

  test('spells out the scale the assistant actually scores on', () => {
    expect(SCORE_SCALE_LABELS).toEqual(
      DAILY_PAGES_SHORT_FORM_SCORE_LABELS.map(
        (entry) => `${entry.value} ${entry.label}`
      )
    );
  });
});

describe('the explanation of the type', () => {
  test('draws the line against Class Starter in so many words', () => {
    const text = [
      ...WHAT_IT_IS,
      ...WHAT_IT_IS_NOT.map((item) => `${item.claim} ${item.detail}`),
    ].join(' ');
    expect(text).toContain('Class Starter');
  });

  test('names what each thing it is not is instead', () => {
    expect(WHAT_IT_IS_NOT.length).toBeGreaterThanOrEqual(4);
    for (const item of WHAT_IT_IS_NOT) {
      expect(item.claim.startsWith('Not ')).toBe(true);
      expect(item.detail.length).toBeGreaterThan(40);
    }
  });

  test('gives a teacher something to do with it, not only a definition', () => {
    expect(WHAT_IT_IS.length).toBeGreaterThanOrEqual(3);
    expect(HOW_TO_USE.length).toBeGreaterThanOrEqual(4);
  });
});

/**
 * Three switches a teacher sets per assignment. The page names each one, in
 * the words the assignment sheet uses.
 */
describe('the per-assignment switches', () => {
  const text = HOW_TO_USE.join(' ');

  test('names the cold write: the tutor switched off', () => {
    expect(text).toContain('cold write');
    expect(text).toContain('Tutor enabled');
  });

  test('names ungraded practice: grade submission switched off', () => {
    expect(text).toContain('Submit for grade');
  });

  test('names the grammar switch', () => {
    expect(text.toLowerCase()).toContain('grammar grading off');
  });

  test('names the writing time', () => {
    expect(text).toContain('Time students have to write');
  });
});

describe('the prompt-writing guidance', () => {
  test('carries the three parts a gradeable prompt needs', () => {
    expect(PROMPT_RECIPE).toHaveLength(3);
    const recipe = PROMPT_RECIPE.map(
      (part) => `${part.move} ${part.detail}`
    ).join(' ');
    // The ask for backing is the part that makes the entry gradeable at all.
    expect(recipe).toContain('Development of Thought');
  });

  test('shows the rewrite, not just the rule', () => {
    expect(PROMPT_REWRITES.length).toBeGreaterThanOrEqual(3);
    for (const rewrite of PROMPT_REWRITES) {
      expect(rewrite.before.length).toBeGreaterThan(10);
      // The rewrite has to be the longer one: it adds the backing and the
      // finish line the original left out.
      expect(rewrite.after.length).toBeGreaterThan(rewrite.before.length);
      expect(rewrite.why.length).toBeGreaterThan(40);
    }
  });

  test('every rewritten prompt names a finish line', () => {
    for (const rewrite of PROMPT_REWRITES) {
      expect(rewrite.after).toMatch(/paragraph|half a page|a page/i);
    }
  });

  test('lists the ways a prompt fails so a teacher can check their own', () => {
    expect(PROMPT_WARNINGS.length).toBeGreaterThanOrEqual(4);
  });
});
