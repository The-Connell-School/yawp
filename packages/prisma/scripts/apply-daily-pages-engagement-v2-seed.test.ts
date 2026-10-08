import { describe, expect, test } from 'bun:test';
import {
  DP_PREVIEW_QA_DATABASE_PATTERN,
  DP_QA_PINNED_LEGACY_RUBRIC_NAME,
  shouldIncludeDpPreviewQaFixtures,
} from './apply-daily-pages-engagement-v2-seed';

describe('DP preview QA database guard', () => {
  test('allows numbered PR preview databases only', () => {
    expect(DP_PREVIEW_QA_DATABASE_PATTERN.test('yawp_pr_412')).toBe(true);
    expect(DP_PREVIEW_QA_DATABASE_PATTERN.test('yawp_pr_1')).toBe(true);
    expect(DP_PREVIEW_QA_DATABASE_PATTERN.test('yawp_demo')).toBe(false);
    expect(DP_PREVIEW_QA_DATABASE_PATTERN.test('yawp')).toBe(false);
    expect(DP_PREVIEW_QA_DATABASE_PATTERN.test('yawp_production')).toBe(false);
  });

  test('shouldIncludeDpPreviewQaFixtures reads current_database()', async () => {
    const prisma = {
      $queryRaw: async () => [{ current_database: 'yawp_pr_412' }],
    };
    expect(await shouldIncludeDpPreviewQaFixtures(prisma as never)).toBe(true);

    const demo = {
      $queryRaw: async () => [{ current_database: 'yawp_demo' }],
    };
    expect(await shouldIncludeDpPreviewQaFixtures(demo as never)).toBe(false);
  });

  test('QA pinned legacy revision uses a dedicated rubric name', () => {
    expect(DP_QA_PINNED_LEGACY_RUBRIC_NAME).toBe('dp-qa-pinned-legacy-engagement');
    expect(DP_QA_PINNED_LEGACY_RUBRIC_NAME).not.toBe('daily-pages-engagement');
  });
});
