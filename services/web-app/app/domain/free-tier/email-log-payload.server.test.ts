import { afterEach, describe, expect, test } from 'bun:test';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';

describe('sanitizeFreeTierEmailLogPayload', () => {
  const prev = process.env.YAWP_ENVIRONMENT;
  const prevDbTests = process.env.FREE_TIER_DB_TESTS;

  afterEach(() => {
    if (prev === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = prev;
    if (prevDbTests === undefined) delete process.env.FREE_TIER_DB_TESTS;
    else process.env.FREE_TIER_DB_TESTS = prevDbTests;
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

  test('keeps URLs in FREE_TIER_DB_TESTS integration runs', () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    process.env.FREE_TIER_DB_TESTS = '1';
    const payload = {
      approveUrl: 'https://yawp.test/free/admin/approve?t=x',
    };
    expect(sanitizeFreeTierEmailLogPayload(payload)).toEqual(payload);
  });

  test('keeps URLs in preview for QA manifest', () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    const payload = {
      approveUrl: 'https://pr-416.preview.yawp.school/free/admin/approve?t=x',
      notRightPersonUrl: 'https://pr-416.preview.yawp.school/free/admin/not-right-person?t=y',
    };
    expect(sanitizeFreeTierEmailLogPayload(payload)).toEqual(payload);
  });
});
