import { describe, expect, test } from 'bun:test';
import {
  buildDailyPagesEngagementRubricCategory,
  dailyPagesEngagementBandDescriptionForTotal,
} from './daily-pages-engagement-rubric';
import { dailyPagesEngagementTierBands } from './daily-pages-engagement-tier-bands';

describe('dailyPagesEngagementBandDescriptionForTotal', () => {
  test('rewrites library 100-point footer for assignment totals 12 and 30', () => {
    const libraryFooter =
      'Narrative copy.\n\nConfigured band for a 100-point assignment: 80–89.';
    for (const total of [12, 30]) {
      const band = dailyPagesEngagementTierBands(total).find(
        (entry) => entry.label === 'Good'
      )!;
      const description = dailyPagesEngagementBandDescriptionForTotal(
        libraryFooter,
        total,
        band
      );
      expect(description).not.toMatch(/100-point/);
      expect(description).toContain(
        `Configured band for a ${total}-point assignment`
      );
    }
  });
});

describe('buildDailyPagesEngagementRubricCategory', () => {
  test('never embeds the 100-point library footer at non-100 totals', () => {
    for (const total of [12, 30]) {
      const category = buildDailyPagesEngagementRubricCategory(total);
      for (const band of category.bands ?? []) {
        expect(band.description).not.toMatch(/100-point/);
      }
    }
  });
});
