import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const sendEmailMock = mock(async () => ({ status: 'success' as const }));
mock.module('~/utils/email.server', () => ({
  sendEmail: sendEmailMock,
  getTransactionalEmailFrom: () => 'Yawp! <noreply@yawp.school>',
}));

const enabled = process.env.APPROVAL_V2_DB_TESTS === '1';
describe.skipIf(!enabled)('admin deny approval', () => {
  let prisma: typeof import('~/utils/db.server').prisma;
  let mintSignedLink: typeof import('./signed-link.server').mintSignedLink;
  let denySchoolAdminApproval: typeof import('./approval-deny.server').denySchoolAdminApproval;
  let loadTeacherDeniedSurface: typeof import('./approval-deny.server').loadTeacherDeniedSurface;
  let resolveAdminDenyAnsweredGate: typeof import('./approval-deny.server').resolveAdminDenyAnsweredGate;
  let forwardApprovalRequest: typeof import('./approval-v2.server').forwardApprovalRequest;
  const orgId = `deny-suite-${crypto.randomUUID()}`;
  const apps: string[] = [];

  beforeEach(async () => {
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-deny-test-secret';
    process.env.PRIMARY_APP_URL = 'http://localhost:5199';
    prisma = (await import('~/utils/db.server')).prisma;
    ({ mintSignedLink } = await import('./signed-link.server'));
    ({
      denySchoolAdminApproval,
      loadTeacherDeniedSurface,
      resolveAdminDenyAnsweredGate,
    } = await import('./approval-deny.server'));
    ({ forwardApprovalRequest } = await import('./approval-v2.server'));
    sendEmailMock.mockClear();
    await prisma.setting.upsert({
      where: { name: 'feature_flag.free_tier' },
      create: {
        name: 'feature_flag.free_tier',
        value: JSON.stringify({ mode: 'targeted', orgIds: [orgId] }),
      },
      update: {
        value: JSON.stringify({ mode: 'targeted', orgIds: [orgId] }),
      },
    });
    await prisma.organization.upsert({
      where: { id: orgId },
      create: { id: orgId, name: 'Deny test org', plan: 'FREE_CLASSROOM' },
      update: { plan: 'FREE_CLASSROOM' },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
      await prisma.$disconnect();
    }
  });

  async function seedSentApp(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `deny-test-${suffix}-${Date.now()}@example.edu`,
      name: 'Jordan Rivera',
      memberships: { create: { organizationId: orgId, role: 'TEACHER' } },
    },
  });
  const app = await prisma.freeTierApplication.create({
    data: {
      userId: user.id,
      email: user.email!,
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      location: 'Local',
      gradeLevel: '11',
      status: 'SENT',
      organizationId: orgId,
    },
  });
  apps.push(app.id);
  const approval = await prisma.freeTierAdminApproval.create({
    data: {
      applicationId: app.id,
      adminName: 'Dr. Patel',
      adminEmail: `patel-${suffix}@lincolnusd.org`,
      emailCopyVersionHash: 'test',
    },
  });
  const link = await mintSignedLink({
    applicationId: app.id,
    purpose: 'ADMIN_APPROVE',
  });
  await prisma.freeTierAdminApproval.update({
    where: { id: approval.id },
    data: { signedLinkId: link.linkId },
  });
  return { app, approval, token: link.token };
  }

  test('deny happy path stops reminders, cancels queue, and emails teacher without reason', async () => {
    const { app, approval, token } = await seedSentApp('happy');
    await prisma.freeTierApprovalDelivery.create({
      data: {
        approvalId: approval.id,
        kind: 'admin_reminder',
        sequence: 1,
        state: 'QUEUED',
        availableAt: new Date(),
        payload: 'enc',
      },
    });
    const req = new Request('http://localhost/deny', { method: 'POST' });
    const result = await denySchoolAdminApproval({
      token,
      reason: 'secret team note',
      request: req,
    });
    expect(result.ok).toBe(true);
    const row = await prisma.freeTierAdminApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(row.status).toBe('DENIED');
    expect(row.denyReason).toBe('secret team note');
    expect(row.autoRemindersStopped).toBe(true);
    const cancelled = await prisma.freeTierApprovalDelivery.findMany({
      where: { approvalId: approval.id },
    });
    expect(cancelled.every((d) => d.state === 'CANCELLED')).toBe(true);
    expect(sendEmailMock).toHaveBeenCalled();
    const calls = sendEmailMock.mock.calls as unknown as Array<
      [{ text?: string; html?: string }]
    >;
    expect(calls.length).toBeGreaterThan(0);
    const payload = calls.at(-1)![0];
    expect(payload.text).not.toContain('secret team note');
    expect(payload.html).not.toContain('secret team note');
    const decision = await prisma.freeTierApprovalDecision.findFirst({
      where: { applicationId: app.id, decision: 'DENIED' },
    });
    expect(decision?.reason).toContain('secret team note');
    expect(await loadTeacherDeniedSurface({ applicationId: app.id })).not.toBeNull();
  });

  test('double deny is idempotent', async () => {
    const { token } = await seedSentApp('double');
    const req = new Request('http://localhost/deny', { method: 'POST' });
    expect((await denySchoolAdminApproval({ token, request: req })).ok).toBe(true);
    expect(
      (await denySchoolAdminApproval({ token, request: req })).ok
    ).toBe(true);
  });

  test('deny after approve returns idempotent approve', async () => {
    const { app, token } = await seedSentApp('after-approve');
    await prisma.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'APPROVED' },
    });
    const result = await denySchoolAdminApproval({
      token,
      request: new Request('http://localhost'),
    });
    expect(result.ok).toBe(true);
    expect('idempotent' in result && result.idempotent).toBe(true);
  });

  test('closed approve link shows admin_denied gate', async () => {
    const { token } = await seedSentApp('closed');
    await denySchoolAdminApproval({
      token,
      request: new Request('http://localhost'),
    });
    const gate = await resolveAdminDenyAnsweredGate({ token });
    expect(gate?.reason).toBe('admin_denied');
  });

  test('teacher ask after deny counts toward cap', async () => {
    const { app, approval, token } = await seedSentApp('cap');
    await denySchoolAdminApproval({
      token,
      request: new Request('http://localhost'),
    });
    await forwardApprovalRequest({
      applicationId: app.id,
      userId: (
        await prisma.freeTierApplication.findUniqueOrThrow({
          where: { id: app.id },
          select: { userId: true },
        })
      ).userId!,
      currentApprovalId: approval.id,
      newAdminName: 'Alex Kim',
      newAdminEmail: 'alex@lincolnusd.org',
      request: new Request('http://localhost'),
    });
    const updated = await prisma.freeTierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(updated.adminRedirectCount).toBe(1);
  });
});
