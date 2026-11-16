import { beforeEach, expect, mock, test } from 'bun:test';

const sendEmail = mock(async (message: { to: string; text: string }) => {
  void message;
  return {
    status: 'success' as const,
    data: { id: 'staff-approve-test' },
  };
});
mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/email.server.ts', () => ({ sendEmail }));

type ApprovalRow = {
  id: string;
  status: string;
  needsManualFollowUp: boolean;
  firstSentAt: Date | null;
  autoRemindersStopped?: boolean;
  stopReason?: string | null;
  decidedAt?: Date | null;
  nextAutoReminderAt?: Date | null;
  nextTeacherFollowUpAt?: Date | null;
};
type DeliveryRow = { id: string; approvalId: string; state: string; error?: string | null };
type EmailLog = {
  applicationId: string;
  kind: string;
  toEmail: string;
  success: boolean;
  error?: string | null;
};

let appStatus = 'MANUAL_REVIEW';
let approvals: ApprovalRow[] = [];
let deliveries: DeliveryRow[] = [];
let emailLogs: EmailLog[] = [];

const tx = {
  freeTierApplication: {
    findUnique: async () => ({
      id: 'application',
      status: appStatus,
      releasedAt: null,
      email: 'teacher@school.edu',
      name: 'Ada Lovelace',
      schoolName: 'North Ridge',
      userId: 'user-1',
      organizationId: null,
      tags: [] as string[],
    }),
    updateMany: async ({ data }: { data: { status: string } }) => {
      appStatus = data.status;
      return { count: 1 };
    },
    findMany: async () => [{ id: 'application' }],
    count: async () => 0,
  },
  freeTierApprovalDecision: { create: async () => ({}) },
  freeTierAdminApproval: {
    findMany: async () =>
      approvals
        .filter((row) => row.status === 'PENDING')
        .map((row) => ({ id: row.id })),
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: { in: string[] }; status: string };
      data: Partial<ApprovalRow>;
    }) => {
      let count = 0;
      for (const row of approvals) {
        if (where.id.in.includes(row.id) && row.status === where.status) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
  },
  freeTierApprovalDelivery: {
    updateMany: async ({
      where,
      data,
    }: {
      where: { approvalId: { in: string[] }; state: string };
      data: { state: string; error: string };
    }) => {
      let count = 0;
      for (const row of deliveries) {
        if (
          where.approvalId.in.includes(row.approvalId) &&
          row.state === where.state
        ) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
  },
  $executeRaw: async () => 1,
};

mock.module('~/utils/db.server', () => ({
  prisma: {
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    freeTierApplication: {
      findUnique: async () => ({ releaseEmailCopyVersion: null }),
    },
    freeTierEmailLog: {
      findFirst: async ({
        where,
      }: {
        where: { applicationId: string; kind: string; success: boolean };
      }) =>
        emailLogs.find(
          (log) =>
            log.applicationId === where.applicationId &&
            log.kind === where.kind &&
            log.success === where.success
        ) ?? null,
      create: async ({ data }: { data: EmailLog }) => {
        emailLogs.push(data);
        return data;
      },
    },
  },
}));
mock.module('~/domain/free-tier/approval-hooks.server', () => ({
  ensureFreeTierProductionApprovalHooks: async () => {},
  getApprovalHooks: () => ({
    onApplicationApproved: async () => {},
    onApplicationRejected: async () => {},
  }),
  setApprovalHooks: () => {},
}));

const { decideApplication } = await import(
  '~/utils/internal-free-tier-http.server'
);

function pendingHold() {
  approvals = [
    {
      id: 'pending',
      status: 'PENDING',
      needsManualFollowUp: true,
      firstSentAt: null,
    },
  ];
  deliveries = [
    { id: 'queued', approvalId: 'pending', state: 'QUEUED' },
    { id: 'sent', approvalId: 'pending', state: 'SENT' },
  ];
}

beforeEach(() => {
  appStatus = 'MANUAL_REVIEW';
  emailLogs = [];
  pendingHold();
  sendEmail.mockClear();
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
  process.env.FREE_TIER_LINK_HMAC_SECRET =
    'staff-approval-follow-up-test-secret';
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  process.env.EMAIL_PROVIDER = 'resend';
});

test('staff approve emails the teacher once, logs it, and closes the admin request', async () => {
  const first = await decideApplication({
    id: 'application',
    decision: 'APPROVED',
    decidedByEmail: 'staff@yawp.school',
  });
  expect(first.status).toBe(200);
  expect(first.changed).toBe(true);
  expect(approvals[0]).toMatchObject({
    status: 'SUPERSEDED',
    needsManualFollowUp: false,
    autoRemindersStopped: true,
    stopReason: 'approved',
    firstSentAt: null,
    nextAutoReminderAt: null,
    nextTeacherFollowUpAt: null,
  });
  expect(approvals[0]?.decidedAt).toBeInstanceOf(Date);
  expect(deliveries.find((row) => row.id === 'queued')).toMatchObject({
    state: 'CANCELLED',
    error: 'approved',
  });
  expect(deliveries.find((row) => row.id === 'sent')?.state).toBe('SENT');
  expect(sendEmail).toHaveBeenCalledTimes(1);
  const message = sendEmail.mock.calls[0]![0];
  expect(message.to).toBe('teacher@school.edu');
  expect(message.text).toContain('https://yawp.test/auth/login');
  expect(message.text).toContain('Yawp! approved Yawp! for your classroom');
  expect(emailLogs).toEqual([
    expect.objectContaining({
      applicationId: 'application',
      kind: 'congratulations',
      toEmail: 'teacher@school.edu',
      success: true,
    }),
  ]);

  const again = await decideApplication({
    id: 'application',
    decision: 'APPROVED',
    decidedByEmail: 'staff@yawp.school',
  });
  expect(again.status).toBe(200);
  expect(again.payload).toMatchObject({ idempotent: true });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(emailLogs).toHaveLength(1);
});

test('a congratulations email already on the application is not sent again', async () => {
  emailLogs.push({
    applicationId: 'application',
    kind: 'congratulations',
    toEmail: 'teacher@school.edu',
    success: true,
  });
  const result = await decideApplication({
    id: 'application',
    decision: 'APPROVED',
    decidedByEmail: 'staff@yawp.school',
  });
  expect(result.changed).toBe(true);
  expect(approvals[0]?.status).toBe('SUPERSEDED');
  expect(sendEmail).not.toHaveBeenCalled();
  expect(emailLogs).toHaveLength(1);
});

test('staff rejection leaves the pending admin request and sends no congratulations email', async () => {
  const result = await decideApplication({
    id: 'application',
    decision: 'REJECTED',
    decidedByEmail: 'staff@yawp.school',
    reason: 'Not a fit',
  });
  expect(result.status).toBe(200);
  expect(approvals[0]?.status).toBe('PENDING');
  expect(approvals[0]?.needsManualFollowUp).toBe(true);
  expect(deliveries.find((row) => row.id === 'queued')?.state).toBe('QUEUED');
  expect(sendEmail).not.toHaveBeenCalled();
  expect(emailLogs).toHaveLength(0);
});
