import { describe, expect, test } from 'bun:test';
import { assertPreviewPlannerQaTarget } from './seed-preview-planner-qa';

describe('assertPreviewPlannerQaTarget', () => {
  test('allows preview database urls', () => {
    expect(() =>
      assertPreviewPlannerQaTarget('postgresql://u:p@host/yawp_pr_374')
    ).not.toThrow();
    expect(() =>
      assertPreviewPlannerQaTarget('postgresql://u:p@host/yawp_demo')
    ).not.toThrow();
  });

  test('refuses unknown production-like urls', () => {
    expect(() =>
      assertPreviewPlannerQaTarget('postgresql://u:p@host/yawp_production')
    ).toThrow(/preview planner QA seed only runs/);
  });

  test('requires DATABASE_URL', () => {
    expect(() => assertPreviewPlannerQaTarget('')).toThrow(/DATABASE_URL is required/);
  });
});
