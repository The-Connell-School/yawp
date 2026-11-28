import { beforeEach, expect, mock, test } from 'bun:test';

const sends: Array<{ to: string; subject: string; text: string }> = [];
const approvalUpdates: Array<Record<string, unknown>> = [];
const logs: Array<{
  kind: string;
  success: boolean;
  toEmail: string;
  payload?: { approvalId?: string };
}> = [];
let appStatus = 'SENT';
let stopReason: string | null = null;

mock.module('~/utils/email.server', () => ({
  sendEmail: async (message: { to: string; subject: string; text: string }) => {
    sends.push(message);
    return { status: 'success' as const, data: { id: 'notice-1' } };
  },
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findUnique: async () =>
        appStatus === 'missing'
          ? null
          : {
              id: 'app-1',
              email: 'teacher@lincoln.edu',
              name: 'Danielle Cabibbo',
              schoolName: 'Lincoln High School',
              status: appStatus,
            },
    },
    freeTierAdminApproval: {
      findFirst: async () =>
        appStatus === 'SENT'
          ? {
              id: 'approval-1',
              adminName: 'Patel',
              adminEmail: 'patel@lincoln.edu',
              stopReason,
              status: 'PENDING',
            }
          : null,
      findMany: async () => [
        {
          id: 'approval-1',
          applicationId: 'app-1',
          adminEmail: 'patel@lincoln.edu',
          firstSentAt: new Date('2026-11-26T15:00:00Z'),
        },
      ],
      update: async ({ data }: { data: Record<string, unknown> }) => {
        approvalUpdates.push(data);
        stopReason = String(data.stopReason ?? stopReason);
        return data;
      },
    },
    freeTierApprovalDelivery: {
      updateMany: async () => ({ count: 1 }),
    },
    freeTierEmailLog: {
      findMany: async ({ where }: { where: { kind: string } }) =>
        logs.filter((row) => row.kind === where.kind && row.success),
      findFirst: async () => ({
        applicationId: 'app-1',
        toEmail: 'patel@lincoln.edu',
        payload: { approvalId: 'approval-1', providerMessageId: 'ses-1' },
      }),
      create: async ({
        data,
      }: {
        data: {
          kind: string;
          success: boolean;
          toEmail: string;
          payload?: { approvalId?: string };
        };
      }) => {
        logs.push(data);
        return data;
      },
    },
  },
}));

const {
  pollSuppressedAdminApprovals,
  recordAdminApprovalUndeliverable,
  recordUndeliverableByProviderMessage,
} = await import('./admin-approval-undeliverable.server');

beforeEach(() => {
  sends.length = 0;
  approvalUpdates.length = 0;
  logs.length = 0;
  appStatus = 'SENT';
  stopReason = null;
  process.env.PRIMARY_APP_URL = 'https://yawp.school';
  delete process.env.INTERNAL_PLATFORM_ORIGIN;
});

test('a bounce marks the request and emails the teacher and the team once', async () => {
  const first = await recordAdminApprovalUndeliverable({
    applicationId: 'app-1',
    approvalId: 'approval-1',
    reason: 'bounced',
  });
  expect(first.teacherNotified).toBe(true);
  expect(first.teamNotified).toBe(true);
  expect(approvalUpdates[0]).toMatchObject({
    needsManualFollowUp: true,
    autoRemindersStopped: true,
    stopReason: 'admin_email_bounced',
    nextAutoReminderAt: null,
  });
  expect(sends.map((message) => message.to).sort()).toEqual([
    'hello@yawp.school',
    'teacher@lincoln.edu',
  ]);
  const teacher = sends.find((message) => message.to === 'teacher@lincoln.edu');
  expect(teacher?.text).toContain('pick another administrator');
  expect(teacher?.text).toContain('/app/free-tier/pending?ask=1');
  expect(teacher?.text).not.toContain('/free/admin/approve');

  const second = await recordAdminApprovalUndeliverable({
    applicationId: 'app-1',
    approvalId: 'approval-1',
    reason: 'bounced',
  });
  expect(second.teacherNotified).toBe(true);
  expect(sends).toHaveLength(2);
});

test('an unknown provider id is ignored and a closed request is not emailed', async () => {
  appStatus = 'APPROVED';
  const closed = await recordUndeliverableByProviderMessage({
    providerMessageId: 'ses-1',
    reason: 'bounced',
  });
  expect(closed.skipped).toBe('closed');
  expect(sends).toHaveLength(0);
});

test('SES suppression after the send records a bounce', async () => {
  process.env.EMAIL_PROVIDER = 'ses';
  await pollSuppressedAdminApprovals({
    minIntervalMs: 0,
    lookup: async () => ({
      reason: 'BOUNCE',
      lastUpdateTime: new Date('2026-11-26T15:05:00Z'),
    }),
  });
  expect(approvalUpdates[0]?.stopReason).toBe('admin_email_bounced');
  expect(sends.some((message) => message.to === 'teacher@lincoln.edu')).toBe(true);
  delete process.env.EMAIL_PROVIDER;
});
