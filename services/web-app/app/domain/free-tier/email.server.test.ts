import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const sendEmail = mock();

mock.module('~/utils/email.server', () => ({ sendEmail }));

const { sendFreeTierAdminApprovalEmail } = await import('./email.server');

describe('free-tier email delivery', () => {
  const secret = process.env.FREE_TIER_LINK_HMAC_SECRET;
  const primary = process.env.PRIMARY_APP_URL;

  beforeEach(() => {
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'unit-test-hmac-secret';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    sendEmail.mockReset();
  });

  afterEach(() => {
    if (secret === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    else process.env.FREE_TIER_LINK_HMAC_SECRET = secret;
    if (primary === undefined) delete process.env.PRIMARY_APP_URL;
    else process.env.PRIMARY_APP_URL = primary;
  });

  test('returns email_failed when sendEmail reports error status', async () => {
    sendEmail.mockResolvedValue({
      status: 'error',
      error: { message: 'provider_down' },
    });
    const result = await sendFreeTierAdminApprovalEmail({
      applicationId: 'app_test',
      to: 'admin@school.edu',
      teacherEmail: 'teacher@school.edu',
      teacherName: 'Teacher',
      schoolName: 'Test HS',
      approveUrl: 'https://yawp.test/a',
      notRightPersonUrl: 'https://yawp.test/n',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toContain('provider_down');
  });
});
