import { describe, expect, test } from 'bun:test';

import {
  applyAssignmentGrammarGrading,
  isGrammarGradingConfigurable,
} from './assignment-grammar-grading';
import { DAILY_PAGES_SHORT_FORM_RUBRIC } from './daily-pages-short-form-rubric';
import { CLASS_STARTER_RUBRIC } from './class-starter-rubric';
import { resolveGrammarHighlightingEnabled } from './rubric-category-options';

const shortForm = DAILY_PAGES_SHORT_FORM_RUBRIC.categories;

describe('isGrammarGradingConfigurable', () => {
  /**
   * The toggle turns grammar grading off. It is offered only where there is
   * something to turn off: switching it on cannot invent a grammar category
   * for a rubric that has none, so offering it there would be a lie.
   */
  test('is offered for a rubric that grades grammar', () => {
    expect(isGrammarGradingConfigurable(shortForm)).toBe(true);
  });

  test('is not offered for a rubric that never grades grammar', () => {
    expect(isGrammarGradingConfigurable(CLASS_STARTER_RUBRIC.categories)).toBe(
      false
    );
  });

  test('is not offered for an empty rubric', () => {
    expect(isGrammarGradingConfigurable([])).toBe(false);
  });
});

describe('applyAssignmentGrammarGrading', () => {
  /**
   * Null is every assignment that existed before this toggle. It has to mean
   * "whatever the rubric says", or turning the column on would silently change
   * how already-assigned work is graded.
   */
  test('leaves the rubric alone when the assignment has no preference', () => {
    expect(applyAssignmentGrammarGrading(shortForm, null)).toEqual(shortForm);
    expect(applyAssignmentGrammarGrading(shortForm, undefined)).toEqual(
      shortForm
    );
  });

  test('leaves the rubric alone when grammar grading is on', () => {
    expect(applyAssignmentGrammarGrading(shortForm, true)).toEqual(shortForm);
  });

  test('drops the grammar category when grammar grading is off', () => {
    const categories = applyAssignmentGrammarGrading(shortForm, false);

    expect(categories.map((category) => category.key)).toEqual([
      'depth_of_thought',
      'development_of_thought',
      'organization_and_structure',
      'voice_and_style',
    ]);
  });

  /**
   * Dropping the category is what turns the highlighting pass off too: the
   * grading route derives highlighting from the categories it is given, so one
   * filter covers both scoring and markup.
   */
  test('turning it off also turns the highlighting pass off', () => {
    expect(resolveGrammarHighlightingEnabled(shortForm)).toBe(true);
    expect(
      resolveGrammarHighlightingEnabled(
        applyAssignmentGrammarGrading(shortForm, false)
      )
    ).toBe(false);
  });

  test('never empties a rubric that is nothing but grammar', () => {
    const grammarOnly = [
      {
        key: 'grammar_and_mechanics',
        label: 'Grammar',
        description: 'Correctness.',
        weight: 1,
      },
    ];

    expect(applyAssignmentGrammarGrading(grammarOnly, false)).toEqual(
      grammarOnly
    );
  });

  test('has nothing to drop from a rubric that never graded grammar', () => {
    const classStarter = CLASS_STARTER_RUBRIC.categories;

    expect(applyAssignmentGrammarGrading(classStarter, false)).toEqual(
      classStarter
    );
  });
});
