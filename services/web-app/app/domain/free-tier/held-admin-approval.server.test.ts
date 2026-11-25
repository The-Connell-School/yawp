import { beforeEach, describe, expect, mock, test } from 'bun:test';

const sendFreeTierAdminApprovalEmail = mock(
  async (): Promise<{ ok: true } | { ok: false; error: string }> => ({
    ok: true,
  })
);
const queueHeld = mock(async () => {});
const v2Enabled = mock(async () => false);
const abandon = mock(async () => {});
const audit = mock(async () => {});

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));
mock.module('./approval-lock.server', () => ({
  lockApprovalApplication: async () => {},
}));
mock.module('./approval-v2.server', () => ({
  isApprovalV2Enabled: v2Enabled,
  queueHeldAdminApprovalInTransaction: queueHeld,
}));
mock.module('./email.server', () => ({ sendFreeTierAdminApprovalEmail }));
mock.module('./free-tier-public-url.server', () => ({
  freeTierPublicAppOrigin: () => 'https://yawp.test',
}));
mock.module('./signed-link.server', () => ({
  mintSignedLink: async (a: { purpose: string }) => ({
    token: `${a.purpose}-token`,
    linkId: `${a.purpose}-link`,
  }),
  abandonMintedSignedLinks: abandon,
  FREE_TIER_LINK_TTL_MS: 60_000,
}));

let app: any;
let approval: any;
let delivery: any;
let emailLog: any;
const appUpdates: any[] = [];
const approvalUpdates: any[] = [];
const decisions: any[] = [];

const tx = {
  freeTierApplication: {
    findUnique: async () => app,
    updateMany: async (a: any) => {
      appUpdates.push(a);
      return { count: app && a.where.status === app.status ? 1 : 0 };
    },
  },
  freeTierAdminApproval: {
    findFirst: async () => approval,
    update: async (a: any) => approvalUpdates.push(a),
  },
  freeTierApprovalDelivery: { findFirst: async () => delivery },
  freeTierEmailLog: { findFirst: async () => emailLog },
  freeTierApprovalDecision: { create: async (a: any) => decisions.push(a) },
  internalPlatformApiAudit: { create: audit },
};
mock.module('~/utils/db.server', () => ({
  prisma: {
    ...tx,
    $transaction: async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { sendHeldAdminApprovalOnOperatorApprove: run } =
  await import('./held-admin-approval.server');

beforeEach(() => {
  app = {
    id: 'app-1',
    status: 'MANUAL_REVIEW',
    email: 'teacher@school.edu',
    name: 'Teacher',
    schoolName: 'School',
    organizationId: 'org-1',
  };
  approval = {
    id: 'appr-1',
    status: 'PENDING',
    adminEmail: 'principal@district.org',
    firstSentAt: null,
    createdAt: new Date(0),
  };
  delivery = null;
  emailLog = null;
  appUpdates.length = 0;
  approvalUpdates.length = 0;
  decisions.length = 0;
  for (const m of [
    sendFreeTierAdminApprovalEmail,
    queueHeld,
    v2Enabled,
    abandon,
    audit,
  ])
    m.mockClear();
  v2Enabled.mockImplementation(async () => false);
  sendFreeTierAdminApprovalEmail.mockImplementation(async () => ({ ok: true }));
});

describe('operator approve on a held administrator request', () => {
  test('legacy path sends the administrator email and moves to SENT', async () => {
    const result = await run({
      id: 'app-1',
      decidedByEmail: 'ops@yawp.school',
    });
    expect(result).toMatchObject({
      handled: true,
      status: 200,
      payload: {
        status: 'SENT',
        previousStatus: 'MANUAL_REVIEW',
        adminApprovalSent: true,
      },
    });
    expect(sendFreeTierAdminApprovalEmail).toHaveBeenCalledTimes(1);
    const args = (sendFreeTierAdminApprovalEmail.mock.calls[0] as any[])[0];
    expect(args.to).toBe('principal@district.org');
    expect(args.approveUrl).toBe(
      'https://yawp.test/free/admin/approve?t=ADMIN_APPROVE-token'
    );
    expect(args.notRightPersonUrl).toBe(
      'https://yawp.test/free/admin/not-right-person?t=ADMIN_NOT_RIGHT_PERSON-token'
    );
    expect(appUpdates[0]).toMatchObject({
      where: { status: 'MANUAL_REVIEW' },
      data: { status: 'SENT' },
    });
    expect(
      approvalUpdates.some((u) => u.data.firstSentAt instanceof Date)
    ).toBe(true);
    expect(decisions[0].data).toMatchObject({
      decision: 'MANUAL_REVIEW',
      decidedByEmail: 'ops@yawp.school',
    });
    expect(queueHeld).not.toHaveBeenCalled();
  });

  test('v2 path queues the request in the outbox instead of sending directly', async () => {
    v2Enabled.mockImplementation(async () => true);
    const result = await run({
      id: 'app-1',
      decidedByEmail: 'ops@yawp.school',
    });
    expect(result).toMatchObject({
      handled: true,
      status: 200,
      payload: { status: 'SENT', queued: true },
    });
    expect(queueHeld).toHaveBeenCalledTimes(1);
    expect(sendFreeTierAdminApprovalEmail).not.toHaveBeenCalled();
    expect(appUpdates[0]).toMatchObject({ data: { status: 'SENT' } });
  });

  test('a failed legacy send abandons the links and keeps the request held', async () => {
    sendFreeTierAdminApprovalEmail.mockImplementation(async () => ({
      ok: false,
      error: 'provider down',
    }));
    const result = await run({
      id: 'app-1',
      decidedByEmail: 'ops@yawp.school',
    });
    expect(result).toMatchObject({ handled: true, status: 502 });
    expect(abandon).toHaveBeenCalledWith([
      'ADMIN_APPROVE-link',
      'ADMIN_NOT_RIGHT_PERSON-link',
    ]);
    expect(appUpdates.at(-1)).toMatchObject({
      where: { status: 'SENT' },
      data: { status: 'MANUAL_REVIEW' },
    });
  });

  test('records the tester audit when one is given', async () => {
    await run({
      id: 'app-1',
      decidedByEmail: 'ops@yawp.school',
      audit: {
        actorEmail: 'ops@yawp.school',
        action: 'approval.approve',
      } as any,
    });
    expect(audit).toHaveBeenCalledTimes(1);
  });

  for (const [name, setup] of [
    ['not in manual review', () => (app.status = 'SENT')],
    ['no pending administrator request', () => (approval = null)],
    ['request already sent', () => (approval.firstSentAt = new Date())],
    ['request already queued', () => (delivery = { id: 'd-1' })],
    ['request already emailed', () => (emailLog = { id: 'l-1' })],
  ] as const) {
    test(`falls through to direct approve when ${name}`, async () => {
      setup();
      expect(
        await run({ id: 'app-1', decidedByEmail: 'ops@yawp.school' })
      ).toEqual({ handled: false });
      expect(sendFreeTierAdminApprovalEmail).not.toHaveBeenCalled();
      expect(queueHeld).not.toHaveBeenCalled();
      expect(appUpdates).toHaveLength(0);
    });
  }
});
