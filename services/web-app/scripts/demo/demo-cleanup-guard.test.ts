import { describe, expect, test } from 'bun:test';
import {
  assertDemoCleanupApplyConfirmation,
  assertDemoCleanupTarget,
  DEMO_CLEANUP_CONFIRMATION_PHRASE,
} from './demo-cleanup-guard';

const demo = {
  APP_ENV: 'demo',
  DATABASE_URL: 'postgresql://user:password@demo-db.example.test/yawp_demo',
  DATABASE_NAME: 'yawp_demo',
};

describe('demo cleanup guard', () => {
  test('accepts yawp_demo demo target', () => {
    expect(() => assertDemoCleanupTarget(demo)).not.toThrow();
  });

  test('refuses non-demo database names', () => {
    expect(() =>
      assertDemoCleanupTarget({ ...demo, DATABASE_NAME: 'yawp_production' })
    ).toThrow(/yawp_demo/);
    expect(() =>
      assertDemoCleanupTarget({
        ...demo,
        DATABASE_URL: 'postgresql://user:password@demo-db.example.test/yawp_production',
      })
    ).toThrow();
  });

  test('requires explicit confirmation for apply', () => {
    expect(() => assertDemoCleanupApplyConfirmation({})).toThrow(
      DEMO_CLEANUP_CONFIRMATION_PHRASE
    );
    expect(() =>
      assertDemoCleanupApplyConfirmation({
        DEMO_CLEANUP_CONFIRMATION: DEMO_CLEANUP_CONFIRMATION_PHRASE,
      })
    ).not.toThrow();
  });
});
