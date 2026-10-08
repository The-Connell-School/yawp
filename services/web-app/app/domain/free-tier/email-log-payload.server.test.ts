import { afterEach, describe, expect, test } from 'bun:test';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';

describe('sanitizeFreeTierEmailLogPayload', () => {
  const prev = process.env.YAWP_ENVIRONMENT;

  afterEach(() => {
    if (prev === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = prev;
  });

  test('strips signed URLs outside preview/dev', () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    expect(
      sanitizeFreeTierEmailLogPayload({
        approveUrl: 'https://yawp.school/free/admin/approve?t=secret',
        notRightPersonUrl: 'https://yawp.school/free/admin/not-right-person?t=secret',
        kind: 'admin_approval',
      })
    ).toEqual({ kind: 'admin_approval' });
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
