import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

type SendEmailMockResult =
  | { status: 'success' }
  | { status: 'error'; error: { statusCode: number } };
const sendEmailMock = mock(async (): Promise<SendEmailMockResult> => ({
  status: 'success',
}));
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
  let reopenDeniedSchoolAdminApproval: typeof import('./approval-deny.server').reopenDeniedSchoolAdminApproval;
  let TEACHER_DENY_EMAIL_DELAY_MS: number;
    let forwardApprovalRequest: typeof import('./approval-v2.server').forwardApprovalRequest;
    let runApprovalJobs: typeof import('./approval-v2.server').runApprovalJobs;
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
      reopenDeniedSchoolAdminApproval,
    } = await import('./approval-deny.server'));
    ({ forwardApprovalRequest, runApprovalJobs, TEACHER_DENY_EMAIL_DELAY_MS } =
      await import('./approval-v2.server'));
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
    const deliveries = await prisma.freeTierApprovalDelivery.findMany({
      where: { approvalId: approval.id },
    });
    expect(
      deliveries
        .filter((d) => d.kind === 'admin_reminder')
        .every((d) => d.state === 'CANCELLED')
    ).toBe(true);
    // The teacher's email is held back so a quick reopen can cancel it.
    const held = deliveries.find((d) => d.kind === 'teacher_deny');
    expect(held?.state).toBe('QUEUED');
    expect(+held!.availableAt).toBeGreaterThan(Date.now() + TEACHER_DENY_EMAIL_DELAY_MS - 60_000);
    expect(sendEmailMock).not.toHaveBeenCalled();
    await runApprovalJobs(new Date(Date.now() + TEACHER_DENY_EMAIL_DELAY_MS + 1000));
    const sentDeny = await prisma.freeTierApprovalDelivery.findUniqueOrThrow({
      where: { id: held!.id },
    });
    expect(sentDeny.state).toBe('SENT');
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

  test('teacher deny email retries from outbox after first send fails', async () => {
    const { app, approval, token } = await seedSentApp('email-retry');
    // The jobs runner also sends other requests' admin emails, so only count
    // (and fail) sends to this teacher.
    let teacherAttempts = 0;
    sendEmailMock.mockImplementation((async (message: { to?: string }) => {
      if (message?.to !== app.email) return { status: 'success' as const };
      teacherAttempts += 1;
      if (teacherAttempts === 1) {
        return { status: 'error' as const, error: { statusCode: 429 } };
      }
      return { status: 'success' as const };
    }) as never);
    const req = new Request('http://localhost/deny', { method: 'POST' });
    expect((await denySchoolAdminApproval({ token, request: req })).ok).toBe(true);
    expect(teacherAttempts).toBe(0);
    await runApprovalJobs(new Date(Date.now() + TEACHER_DENY_EMAIL_DELAY_MS + 1000));
    expect(teacherAttempts).toBe(1);
    const delivery = await prisma.freeTierApprovalDelivery.findUnique({
      where: {
        approvalId_kind_sequence: {
          approvalId: approval.id,
          kind: 'teacher_deny',
          sequence: 1,
        },
      },
    });
    expect(delivery?.state).toBe('QUEUED');
    await prisma.freeTierApprovalDelivery.update({
      where: { id: delivery!.id },
      data: { availableAt: new Date() },
    });
    await runApprovalJobs(new Date());
    expect(teacherAttempts).toBe(2);
    const successLogs = await prisma.freeTierEmailLog.findMany({
      where: { applicationId: app.id, kind: 'teacher_deny', success: true },
    });
    expect(successLogs).toHaveLength(1);
    const sent = await prisma.freeTierApprovalDelivery.findUniqueOrThrow({
      where: { id: delivery!.id },
    });
    expect(sent.state).toBe('SENT');
    sendEmailMock.mockImplementation(async () => ({ status: 'success' as const }));
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

  test('reopen puts the request back to pending with a fresh approve link and cancels the held email', async () => {
    const { app, approval, token } = await seedSentApp('reopen');
    await denySchoolAdminApproval({ token, request: new Request('http://localhost') });

    const reopened = await reopenDeniedSchoolAdminApproval({ token });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.approveToken).not.toBe(token);

    const row = await prisma.freeTierAdminApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(row.status).toBe('PENDING');
    expect(row.decidedAt).toBeNull();
    expect(row.denyReason).toBeNull();
    expect(row.autoRemindersStopped).toBe(false);

    const deny = await prisma.freeTierApprovalDelivery.findUniqueOrThrow({
      where: {
        approvalId_kind_sequence: { approvalId: approval.id, kind: 'teacher_deny', sequence: 1 },
      },
    });
    expect(deny.state).toBe('CANCELLED');
    await runApprovalJobs(new Date(Date.now() + TEACHER_DENY_EMAIL_DELAY_MS + 1000));
    const denyEmails = await prisma.freeTierEmailLog.findMany({
      where: { applicationId: app.id, kind: 'teacher_deny' },
    });
    expect(denyEmails).toHaveLength(0);

    // The fresh link is the one the approval now owns, so the approve page accepts it.
    const linkId = JSON.parse(
      Buffer.from(reopened.approveToken.split('.')[0]!, 'base64url').toString()
    ).linkId;
    expect(row.signedLinkId).toBe(linkId);
    expect(await loadTeacherDeniedSurface({ applicationId: app.id })).toBeNull();
  });

  test('reopen refuses a forged or unrelated token', async () => {
    const { token } = await seedSentApp('reopen-forged');
    await denySchoolAdminApproval({ token, request: new Request('http://localhost') });
    const [body, sig, opaque] = token.split('.');
    const forged = `${body}.${sig}.${opaque!.slice(0, -2)}xx`;
    expect(await reopenDeniedSchoolAdminApproval({ token: forged })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await reopenDeniedSchoolAdminApproval({ token: 'nope' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  test('reopen only applies to a denied approval', async () => {
    const { token } = await seedSentApp('reopen-not-denied');
    expect(await reopenDeniedSchoolAdminApproval({ token })).toEqual({
      ok: false,
      reason: 'not_denied',
    });
  });

  test('reopen is refused once the teacher has asked another administrator', async () => {
    const { app, token } = await seedSentApp('reopen-superseded');
    await denySchoolAdminApproval({ token, request: new Request('http://localhost') });
    await prisma.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: 'Ms. Okafor',
        adminEmail: 'okafor@lincolnusd.org',
        emailCopyVersionHash: 'test',
      },
    });
    expect(await reopenDeniedSchoolAdminApproval({ token })).toEqual({
      ok: false,
      reason: 'superseded',
    });
  });

  test('reopen is refused once the request has closed', async () => {
    const { app, token } = await seedSentApp('reopen-closed');
    await denySchoolAdminApproval({ token, request: new Request('http://localhost') });
    await prisma.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'REJECTED' },
    });
    expect(await reopenDeniedSchoolAdminApproval({ token })).toEqual({
      ok: false,
      reason: 'closed',
    });
  });
});
