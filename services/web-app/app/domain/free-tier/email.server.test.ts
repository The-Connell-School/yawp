import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const sendEmail = mock((_options: any): any => undefined);

mock.module('~/utils/email.server', () => ({ sendEmail }));
const logEmail = mock(async (_options: any) => ({}));
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierEmailLog: { create: logEmail } },
}));

const { sendFreeTierAdminApprovalEmail, sendFreeTierAdminReminderEmail } =
  await import('./email.server');

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

const environmentKeys = [
  'NODE_ENV',
  'PREVIEW_SLUG',
  'YAWP_ENVIRONMENT',
  'APP_ENV',
  'FREE_TIER_BUDGET_ENVIRONMENT',
  'PREVIEW_DEPLOYMENT_ID',
  'RENDER_EXTERNAL_HOSTNAME',
  'PLATFORM_HOST',
  'HOSTNAME',
] as const;
const environmentBefore = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);
describe('approval recipients and fixed copy', () => {
  beforeEach(() => {
    for (const key of environmentKeys) delete process.env[key];
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'unit-test-hmac-secret';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'success' });
  });
  afterEach(() => {
    for (const key of environmentKeys) {
      const value = environmentBefore[key];
      if (value === undefined) delete process.env[key];
      else (process.env as Record<string, string | undefined>)[key] = value;
    }
  });
  for (const environment of ['demo', 'production', 'preview'] as const) {
    for (const path of ['initial', 'reminder', 'replacement'] as const) {
      test(`${environment} ${path}: administrator To, demo-only teacher BCC, fixed content`, async () => {
        process.env.NODE_ENV = 'production';
        process.env.FREE_TIER_BUDGET_ENVIRONMENT =
          environment === 'demo' ? 'production' : 'demo';
        process.env.PREVIEW_SLUG =
          environment === 'demo'
            ? 'demo'
            : environment === 'preview'
              ? 'pr-999'
              : '';
        process.env.YAWP_ENVIRONMENT =
          environment === 'demo' ? 'preview' : environment;
        const args = {
          applicationId: 'app_test',
          to: 'principal@example.edu',
          teacherEmail: 'teacher@example.edu',
          teacherName: 'Teacher',
          schoolName: 'Example High',
          personalNote: 'CRAFTED OR HISTORICAL INTRODUCTION',
          approveUrl: 'https://yawp.test/approve',
          notRightPersonUrl: 'https://yawp.test/forward',
          ...(path === 'replacement'
            ? { adminRecipientName: 'New Principal' }
            : {}),
        };
        const result = await (
          path === 'reminder'
            ? sendFreeTierAdminReminderEmail
            : sendFreeTierAdminApprovalEmail
        )(args);
        expect(result.ok).toBe(true);
        const delivered = sendEmail.mock.calls[0][0];
        expect(delivered.to).toBe(args.to);
        if (environment === 'demo')
          expect(delivered.bcc).toEqual([args.teacherEmail]);
        else expect(delivered).not.toHaveProperty('bcc');
        expect(delivered.text).not.toContain(args.personalNote);
        expect(delivered.html).not.toContain(args.personalNote);
        expect(delivered.text).toContain(args.approveUrl);
        expect(delivered.text).toContain(args.notRightPersonUrl);
        expect(delivered.text).toContain('This link works for 14 days');
        expect(logEmail.mock.calls.at(-1)?.[0].data.success).toBe(true);
      });
    }
  }
});
