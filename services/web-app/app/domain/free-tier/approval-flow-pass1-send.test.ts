import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { adminApprovalEmailPreheader } from './admin-approval-copy';

type SendPayload = { to: string; text: string; html: string };
const sendEmail = mock(async (_options: SendPayload) => ({
  status: 'success' as const,
}));
mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierEmailLog: { create: async () => ({}) } },
}));

const TEACHER = 'Jordan Rivera';
const SCHOOL = 'Lincoln High School';
const PASS1_PREHEADER = adminApprovalEmailPreheader({
  teacherName: TEACHER,
  schoolName: SCHOOL,
  pass1: true,
});

describe('legacy send paths thread pass1 into designed email', () => {
  const primary = process.env.PRIMARY_APP_URL;
  beforeEach(() => {
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'unit-test-hmac-secret';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    process.env.YAWP_ENVIRONMENT = 'production';
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'success' });
  });
  afterEach(() => {
    if (primary === undefined) delete process.env.PRIMARY_APP_URL;
    else process.env.PRIMARY_APP_URL = primary;
  });

  test('sendFreeTierAdminApprovalEmail with pass1 renders E1 preheader copy', async () => {
    const { sendFreeTierAdminApprovalEmail } = await import('./email.server');
    const result = await sendFreeTierAdminApprovalEmail({
      applicationId: 'app',
      to: 'admin@example.test',
      teacherEmail: 'teacher@example.test',
      teacherName: TEACHER,
      schoolName: SCHOOL,
      approveUrl: 'https://yawp.test/a',
      notRightPersonUrl: 'https://yawp.test/n',
      pass1: true,
    });
    expect(result.ok).toBe(true);
    const delivered = sendEmail.mock.calls[0]![0] as SendPayload;
    expect(delivered.html).toContain(PASS1_PREHEADER);
    expect(delivered.html).toContain('needs your OK');
    const e1Footer =
      "You're getting this because Jordan Rivera named you as the administrator who can approve classroom software at Lincoln High School.";
    expect(delivered.text).toContain(e1Footer);
    expect(delivered.html).toContain(
      'named you as the administrator who can approve classroom software at Lincoln High School'
    );
    expect(delivered.text).not.toContain(
      'They named you as the administrator who can approve classroom software.'
    );
    expect(delivered.html).not.toContain(
      'They named you as the administrator who can approve classroom software.'
    );
    expect(delivered.text).not.toContain(
      'named you as an administrator at Lincoln High School.'
    );
  });

  test('sendFreeTierAdminReminderEmail with pass1 renders pass1 reminder muted lead', async () => {
    const { sendFreeTierAdminReminderEmail } = await import('./email.server');
    const result = await sendFreeTierAdminReminderEmail({
      applicationId: 'app',
      to: 'admin@example.test',
      teacherEmail: 'teacher@example.test',
      teacherName: TEACHER,
      schoolName: SCHOOL,
      approveUrl: 'https://yawp.test/a',
      notRightPersonUrl: 'https://yawp.test/n',
      pass1: true,
    });
    expect(result.ok).toBe(true);
    const delivered = sendEmail.mock.calls[0]![0] as SendPayload;
    expect(delivered.text).toContain(
      'A quick reminder: Jordan Rivera at Lincoln High School is still waiting on your approval.'
    );
  });

  test('legacy forward send with pass1 renders pass1 E3 forward banner', async () => {
    const { sendFreeTierAdminApprovalEmail } = await import('./email.server');
    const result = await sendFreeTierAdminApprovalEmail({
      applicationId: 'app',
      to: 'new-admin@example.test',
      teacherEmail: 'teacher@example.test',
      teacherName: TEACHER,
      schoolName: SCHOOL,
      approveUrl: 'https://yawp.test/a',
      notRightPersonUrl: 'https://yawp.test/n',
      forwardedByAdminName: 'Sam Chen',
      pass1: true,
    });
    expect(result.ok).toBe(true);
    const delivered = sendEmail.mock.calls[0]![0] as SendPayload;
    expect(delivered.text).toContain(
      "Sam Chen forwarded Jordan Rivera's request at Lincoln High School to you."
    );
  });
});
