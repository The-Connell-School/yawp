import { describe, expect, test } from 'bun:test';

import {
  CLASS_STARTER_ASSIGNMENT_TYPE_KIND,
  CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY,
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORING_SCALE,
} from './class-starter-rubric';
import {
  DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
  DAILY_PAGES_ENGAGEMENT_RUBRIC,
  DAILY_PAGES_ENGAGEMENT_SCORING_SCALE,
} from './daily-pages-engagement-rubric';
import {
  isCategoryFeedbackEnabled,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

describe('the Class Starter rubric shape', () => {
  test('is its own assignment type kind', () => {
    expect(CLASS_STARTER_ASSIGNMENT_TYPE_KIND).toBe('class_starter');
  });

  test('judges engagement with the prompt, same category as Daily Pages', () => {
    expect(CLASS_STARTER_RUBRIC.categories).toHaveLength(1);
    expect(CLASS_STARTER_RUBRIC.categories[0].key).toBe(
      CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY
    );
    expect(CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY).toBe(
      DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY
    );
    expect(CLASS_STARTER_RUBRIC).toEqual(DAILY_PAGES_ENGAGEMENT_RUBRIC);
  });

  test('shares the engagement points scale with Daily Pages', () => {
    expect(CLASS_STARTER_SCORING_SCALE).toEqual(
      DAILY_PAGES_ENGAGEMENT_SCORING_SCALE
    );
  });

  test('stays soft: overall feedback only, no grammar markup', () => {
    expect(isCategoryFeedbackEnabled(CLASS_STARTER_RUBRIC.categories[0])).toBe(
      false
    );
    expect(
      resolveGrammarHighlightingEnabled(CLASS_STARTER_RUBRIC.categories)
    ).toBe(false);
  });

  test('introduces Class Starter in the grading instructions', () => {
    const instructions = (
      CLASS_STARTER_PROMPT_CONFIG.gradingInstructions ?? ''
    ).toLowerCase();

    expect(instructions).toContain('class starter');
    expect(instructions).toContain('engagement');
    expect(instructions).toContain('grammar');
  });
});
