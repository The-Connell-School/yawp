import { describe, expect, test } from 'bun:test';

import {
  CLASS_STARTER_ASSIGNMENT_TYPE_KIND,
  CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY,
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORE_LABELS,
  CLASS_STARTER_SCORING_SCALE,
  classStarterEngagementLabel,
  classStarterEngagementScore,
} from './class-starter-rubric';
import {
  DAILY_PAGES_SCORE_LABELS,
  DAILY_PAGES_SCORING_SCALE,
} from './daily-pages-rubric';
import {
  isCategoryFeedbackEnabled,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

describe('the Class Starter rubric shape', () => {
  test('is its own assignment type kind', () => {
    expect(CLASS_STARTER_ASSIGNMENT_TYPE_KIND).toBe('class_starter');
  });

  test('judges engagement and nothing else', () => {
    expect(CLASS_STARTER_RUBRIC.categories).toHaveLength(1);
    expect(CLASS_STARTER_RUBRIC.categories[0].key).toBe(
      CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY
    );
    expect(CLASS_STARTER_RUBRIC.categories[0].weight).toBe(1);
  });

  /**
   * Class Starter is today's Daily Pages under a new name. A teacher whose
   * Daily Pages assignments move over must keep scoring on the same numbers
   * and the same four words, so drift between the two is a test failure, not
   * a detail.
   */
  test('keeps the scale and the four words Daily Pages already scored on', () => {
    expect(CLASS_STARTER_SCORING_SCALE).toEqual(DAILY_PAGES_SCORING_SCALE);
    expect(CLASS_STARTER_SCORE_LABELS).toEqual(DAILY_PAGES_SCORE_LABELS);
  });

  test('stays soft: overall feedback only, no grammar markup', () => {
    expect(isCategoryFeedbackEnabled(CLASS_STARTER_RUBRIC.categories[0])).toBe(
      false
    );
    expect(
      resolveGrammarHighlightingEnabled(CLASS_STARTER_RUBRIC.categories)
    ).toBe(false);
  });

  test('grades that the student wrote and reflected, not how well', () => {
    const instructions = (
      CLASS_STARTER_PROMPT_CONFIG.gradingInstructions ?? ''
    ).toLowerCase();

    expect(instructions).toContain('class starter');
    expect(instructions).toContain('engagement');
    expect(instructions).toContain('reflect');
    // The soft assistant never marks correctness down.
    expect(instructions).toContain('do not grade grammar');
  });

  test('does not ask for what a graded Daily Pages entry asks for', () => {
    const instructions = (
      CLASS_STARTER_PROMPT_CONFIG.gradingInstructions ?? ''
    ).toLowerCase();

    expect(instructions).not.toContain('assigned text');
    expect(instructions).not.toContain('quote');
  });
});

describe('the Class Starter engagement score mapping', () => {
  const cases: Array<[number, string]> = [
    [3, 'All in'],
    [2, 'Showed up'],
    [1, 'Hardly there'],
    [0, 'Absent'],
  ];

  test.each(cases)('%i maps to "%s"', (score, label) => {
    expect(classStarterEngagementLabel(score)).toBe(label);
  });

  test.each(cases)('"%s" maps back to %i', (score, label) => {
    expect(classStarterEngagementScore(label)).toBe(score);
  });

  test('has no label for a score outside the scale', () => {
    expect(classStarterEngagementLabel(4)).toBeNull();
    expect(classStarterEngagementLabel(-1)).toBeNull();
    expect(classStarterEngagementScore('Phoned it in')).toBeNull();
  });
});
