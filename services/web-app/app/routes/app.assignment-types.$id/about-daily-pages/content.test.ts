import { describe, expect, test } from 'bun:test';

import { DAILY_PAGES_ENGAGEMENT_TIER_LABELS } from '~/domain/assignment-types/daily-pages-engagement-rubric';
import { dailyPagesEngagementTierBands } from '~/domain/assignment-types/daily-pages-engagement-tier-bands';

import {
  ABOUT_LEDE,
  GRADING_SUMMARY,
  HOW_ITS_GRADED_INTRO,
  SCORE_SCALE_LABELS,
  WHAT_IT_IS,
  WHAT_IT_IS_NOT,
  howToUse,
} from './content';

describe('Daily Pages about copy', () => {
  test('describes engagement grading, not short-form essay categories', () => {
    expect(ABOUT_LEDE.toLowerCase()).toContain('engagement');
    expect(ABOUT_LEDE.toLowerCase()).toContain('never measures grammar');
    expect(WHAT_IT_IS.join(' ')).toContain('Excellent');
    expect(GRADING_SUMMARY.map((row) => row.tier)).toEqual([
      ...DAILY_PAGES_ENGAGEMENT_TIER_LABELS,
    ]);
  });

  test('illustrates bands on a 30-point assignment', () => {
    const bands = dailyPagesEngagementTierBands(30);
    expect(SCORE_SCALE_LABELS.length).toBe(bands.length);
    expect(SCORE_SCALE_LABELS[0]).toContain('Not Present');
    expect(HOW_ITS_GRADED_INTRO).toContain('5');
  });

  test('contrasts Class Starter without claiming a formal paragraph rubric', () => {
    const classStarter = WHAT_IT_IS_NOT.find((item) =>
      item.detail.includes('Class Starter')
    );
    expect(classStarter).toBeDefined();
    expect(WHAT_IT_IS.join(' ').toLowerCase()).not.toContain('thesis');
  });

  test('howToUse ignores retired writing-conditions lines when flag is off', () => {
    const items = howToUse(false);
    expect(items.every((item) => !item.includes('Paragraph type'))).toBe(true);
  });
});
