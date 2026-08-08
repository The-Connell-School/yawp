import { describe, expect, test } from 'bun:test';
import {
  DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
  DAILY_PAGES_PROMPT_CONFIG,
  DAILY_PAGES_RUBRIC,
  DAILY_PAGES_SCORING_SCALE,
  dailyPagesEngagementLabel,
  dailyPagesEngagementScore,
} from './daily-pages-rubric';
import {
  getCategoryScoreLabel,
  isCategoryFeedbackEnabled,
  isGrammarHighlightCategory,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

describe('the Daily Pages rubric shape', () => {
  test('judges engagement and nothing else', () => {
    expect(DAILY_PAGES_RUBRIC.categories).toHaveLength(1);
    expect(DAILY_PAGES_RUBRIC.categories[0].key).toBe(
      DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY
    );
    expect(DAILY_PAGES_RUBRIC.categories[0].weight).toBe(1);
  });

  test('scores engagement 0-3', () => {
    expect(DAILY_PAGES_SCORING_SCALE.minScore).toBe(0);
    expect(DAILY_PAGES_SCORING_SCALE.maxScore).toBe(3);
  });

  test('turns off per-category feedback, leaving overall feedback only', () => {
    expect(isCategoryFeedbackEnabled(DAILY_PAGES_RUBRIC.categories[0])).toBe(
      false
    );
  });

  test('turns off grammar and syntax highlighting', () => {
    expect(isGrammarHighlightCategory(DAILY_PAGES_RUBRIC.categories[0])).toBe(
      false
    );
    expect(resolveGrammarHighlightingEnabled(DAILY_PAGES_RUBRIC.categories)).toBe(
      false
    );
  });

  test('asks for a single engagement judgment in its grading instructions', () => {
    const instructions = DAILY_PAGES_PROMPT_CONFIG.gradingInstructions ?? '';
    expect(instructions.trim().length).toBeGreaterThan(0);
    expect(instructions.toLowerCase()).toContain('engagement');
  });
});

describe('the Daily Pages engagement score mapping', () => {
  const cases: Array<[number, string]> = [
    [3, 'All in'],
    [2, 'Showed up'],
    [1, 'Hardly there'],
    [0, 'Absent'],
  ];

  test.each(cases)('%i maps to "%s"', (score, label) => {
    expect(dailyPagesEngagementLabel(score)).toBe(label);
  });

  test.each(cases)('"%s" is the label stored on the category', (score, label) => {
    expect(
      getCategoryScoreLabel(DAILY_PAGES_RUBRIC.categories[0], score)
    ).toBe(label);
  });

  test.each(cases)('"%s" maps back to %i', (score, label) => {
    expect(dailyPagesEngagementScore(label)).toBe(score);
  });

  test('covers every score in the scale and nothing outside it', () => {
    const values = DAILY_PAGES_RUBRIC.categories[0].scoreLabels?.map(
      (entry) => entry.value
    );
    expect(values?.slice().sort()).toEqual([0, 1, 2, 3]);
  });

  test('has no label for a score outside the scale', () => {
    expect(dailyPagesEngagementLabel(4)).toBeNull();
    expect(dailyPagesEngagementLabel(-1)).toBeNull();
    expect(dailyPagesEngagementScore('Phoned it in')).toBeNull();
  });
});
