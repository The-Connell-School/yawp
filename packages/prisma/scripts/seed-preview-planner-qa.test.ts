import { describe, expect, test } from 'bun:test';
import {
  assertPreviewPlannerQaTarget,
  isDemoPlannerQaEnvironment,
} from './seed-preview-planner-qa';

describe('isDemoPlannerQaEnvironment', () => {
  test('detects demo slug and database', () => {
    expect(isDemoPlannerQaEnvironment({ PREVIEW_SLUG: 'demo' })).toBe(true);
    expect(isDemoPlannerQaEnvironment({ DATABASE_NAME: 'yawp_demo' })).toBe(
      true
    );
    expect(
      isDemoPlannerQaEnvironment({
        DATABASE_URL: 'postgresql://u:p@host/yawp_demo',
      })
    ).toBe(true);
  });
});

describe('assertPreviewPlannerQaTarget', () => {
  test('allows preview database urls', () => {
    expect(() =>
      assertPreviewPlannerQaTarget('postgresql://u:p@host/yawp_pr_374')
    ).not.toThrow();
  });

  test('refuses demo database urls', () => {
    expect(() =>
      assertPreviewPlannerQaTarget('postgresql://u:p@host/yawp_demo')
    ).toThrow(/refused on demo database/);
  });

  test('refuses production database urls', () => {
    expect(() =>
      assertPreviewPlannerQaTarget('postgresql://u:p@host/yawp_production')
    ).toThrow(/refused on production database/);
  });

  test('refuses unknown production-like urls', () => {
    expect(() =>
      assertPreviewPlannerQaTarget('postgresql://u:p@host/yawp_live')
    ).toThrow(/preview planner QA seed only runs/);
  });

  test('requires DATABASE_URL', () => {
    expect(() => assertPreviewPlannerQaTarget('')).toThrow(/DATABASE_URL is required/);
  });
});
