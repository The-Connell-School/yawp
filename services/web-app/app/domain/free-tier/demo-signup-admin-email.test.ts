import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { teacherAtSchool } from './admin-approval-copy';
import {
  buildDesignedAdminApprovalEmail,
  htmlForStoredAdminApprovalEmail,
} from './admin-approval-email.server';

const sendEmail = mock(async (_options: unknown) => ({
  status: 'success' as const,
  data: { id: 'demo-signup-email-test' },
}));

mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierEmailLog: { create: async () => ({}) } },
}));

const environmentKeys = [
  'NODE_ENV',
  'PREVIEW_SLUG',
  'YAWP_ENVIRONMENT',
  'APP_ENV',
  'FREE_TIER_BUDGET_ENVIRONMENT',
] as const;
const environmentBefore = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);

const teacherName = 'Jordan Rivera';
const schoolName = 'Lincoln High School';
const teacherEmail = 'jrivera@lincolnhs.org';
const atSchool = teacherAtSchool(teacherName, schoolName);
const approveUrl = 'https://yawp.test/free/admin/approve?t=fake-approve';
const notRightPersonUrl =
  'https://yawp.test/free/admin/not-right-person?t=fake-forward';

function expectDesignedDelivery(delivery: {
  subject: string;
  text: string;
  html: string;
}) {
  expect(delivery.text).toContain('Review and approve:');
  expect(delivery.text).toContain(approveUrl);
  expect(delivery.html).toContain('Review and approve</a>');
  expect(delivery.html).toContain(`href="${approveUrl}"`);
  expect(delivery.html).not.toMatch(/plainTextEmailToHtml/i);
  expect(delivery.subject).not.toBe(`Approve Yawp! for ${schoolName}`);
}

describe('demo free-tier signup admin email subjects (#659)', () => {
  beforeEach(() => {
    for (const key of environmentKeys) delete process.env[key];
    process.env.NODE_ENV = 'production';
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.PREVIEW_SLUG = 'demo';
    process.env.FREE_TIER_BUDGET_ENVIRONMENT = 'production';
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'unit-test-hmac-secret';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({
      status: 'success',
      data: { id: 'demo-signup-email-test' },
    });
  });

  afterEach(() => {
    for (const key of environmentKeys) {
      const value = environmentBefore[key];
      if (value === undefined) delete process.env[key];
      else (process.env as Record<string, string | undefined>)[key] = value;
    }
  });

  test('initial admin send on signup uses the approval subject with button and plain text', async () => {
    const { sendFreeTierAdminApprovalEmail } = await import('./email.server');
    const result = await sendFreeTierAdminApprovalEmail({
      applicationId: 'app_demo_signup',
      to: 'principal@lincolnhs.org',
      teacherEmail,
      teacherName,
      schoolName,
      approveUrl,
      notRightPersonUrl,
    });
    expect(result.ok).toBe(true);
    const delivery = sendEmail.mock.calls[0]![0] as {
      subject: string;
      text: string;
      html: string;
    };
    expect(delivery.subject).toBe(`${atSchool} would like to use Yawp!`);
    expectDesignedDelivery(delivery);
  });

  test('forward recipient on approval-v2 outbox uses the forward subject with button and plain text', async () => {
    const designed = await buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      forwardedByAdminName: 'Sam Chen',
    });
    expect(designed.subject).toBe(`Can you approve Yawp! for ${atSchool}?`);
    expectDesignedDelivery(designed);

    const html = await htmlForStoredAdminApprovalEmail({
      subject: designed.subject,
      text: designed.text,
      html: designed.html,
      teacherName,
      teacherEmail,
      schoolName,
    });
    expect(html).toContain('Review and approve</a>');
    expect(designed.text).toContain('Sam Chen forwarded this to you');
  });
});
