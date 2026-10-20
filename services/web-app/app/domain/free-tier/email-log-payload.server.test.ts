import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';

describe('sanitizeFreeTierEmailLogPayload', () => {
  const envKeys = [
    'YAWP_ENVIRONMENT',
    'FREE_TIER_DB_TESTS',
    'NODE_ENV',
    'PREVIEW_SLUG',
    'PR_NUMBER',
    'E2E',
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      prev[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  test('strips signed URLs outside preview/dev', () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    delete process.env.FREE_TIER_DB_TESTS;
    expect(
      sanitizeFreeTierEmailLogPayload({
        approveUrl: 'https://yawp.school/free/admin/approve?t=secret',
        notRightPersonUrl: 'https://yawp.school/free/admin/not-right-person?t=secret',
        kind: 'admin_approval',
      })
    ).toEqual({ kind: 'admin_approval' });
  });

  test('strips signed URLs on production NODE_ENV without YAWP_ENVIRONMENT', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.FREE_TIER_DB_TESTS;
    expect(
      sanitizeFreeTierEmailLogPayload({
        approveUrl: 'https://yawp.school/free/admin/approve?t=secret',
        kind: 'admin_approval',
      })
    ).toEqual({ kind: 'admin_approval' });
  });

  test('strips signed URLs on live demo (preview env + demo slug, no PR)', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_SLUG = 'demo';
    delete process.env.PR_NUMBER;
    delete process.env.FREE_TIER_DB_TESTS;
    expect(
      sanitizeFreeTierEmailLogPayload({
        approveUrl: 'https://demo.yawp.school/free/admin/approve?t=secret',
        notRightPersonUrl:
          'https://demo.yawp.school/free/admin/not-right-person?t=secret',
        joinUrl: 'https://demo.yawp.school/free/join?t=secret',
        kind: 'admin_approval',
      })
    ).toEqual({ kind: 'admin_approval' });
  });

  test('strips signed URLs when YAWP_ENVIRONMENT is demo', () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    delete process.env.FREE_TIER_DB_TESTS;
    expect(
      sanitizeFreeTierEmailLogPayload({
        approveUrl: 'https://demo.yawp.school/free/admin/approve?t=secret',
        kind: 'admin_approval',
      })
    ).toEqual({ kind: 'admin_approval' });
  });

  test('keeps URLs in FREE_TIER_DB_TESTS integration runs', () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    process.env.FREE_TIER_DB_TESTS = '1';
    const payload = {
      approveUrl: 'https://yawp.test/free/admin/approve?t=x',
    };
    expect(sanitizeFreeTierEmailLogPayload(payload)).toEqual(payload);
  });

  test('keeps URLs on PR preview for QA manifest', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_SLUG = 'pr-416';
    process.env.PR_NUMBER = '416';
    const payload = {
      approveUrl: 'https://pr-416.preview.yawp.school/free/admin/approve?t=x',
      notRightPersonUrl:
        'https://pr-416.preview.yawp.school/free/admin/not-right-person?t=y',
    };
    expect(sanitizeFreeTierEmailLogPayload(payload)).toEqual(payload);
  });

  test('keeps URLs on PR preview under NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_SLUG = 'pr-416';
    process.env.PR_NUMBER = '416';
    const payload = {
      approveUrl: 'https://pr-416.preview.yawp.school/free/admin/approve?t=x',
    };
    expect(sanitizeFreeTierEmailLogPayload(payload)).toEqual(payload);
  });
});
