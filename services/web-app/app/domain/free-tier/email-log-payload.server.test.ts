import { afterEach, describe, expect, test } from 'bun:test';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';

describe('sanitizeFreeTierEmailLogPayload', () => {
  const savedYawp = process.env.YAWP_ENVIRONMENT;
  const savedDbTests = process.env.FREE_TIER_DB_TESTS;
  const savedNodeEnv = process.env.NODE_ENV;
  const savedPreviewSlug = process.env.PREVIEW_SLUG;
  const savedPrNumber = process.env.PR_NUMBER;
  const savedE2e = process.env.E2E;

  afterEach(() => {
    if (savedYawp === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = savedYawp;
    if (savedDbTests === undefined) delete process.env.FREE_TIER_DB_TESTS;
    else process.env.FREE_TIER_DB_TESTS = savedDbTests;
    if (savedNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedPreviewSlug === undefined) delete process.env.PREVIEW_SLUG;
    else process.env.PREVIEW_SLUG = savedPreviewSlug;
    if (savedPrNumber === undefined) delete process.env.PR_NUMBER;
    else process.env.PR_NUMBER = savedPrNumber;
    if (savedE2e === undefined) delete process.env.E2E;
    else process.env.E2E = savedE2e;
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
