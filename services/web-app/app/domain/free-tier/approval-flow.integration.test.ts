// FREE_TIER_DB_TESTS=1 DATABASE_URL=... bun test app/domain/free-tier/approval-flow.integration.test.ts
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const sendEmailMock = mock(async () => ({
  status: 'success' as const,
  data: { id: 'integration-test-email' },
}));
mock.module('~/utils/email.server.ts', () => ({ sendEmail: sendEmailMock }));
mock.module('~/utils/email.server', () => ({ sendEmail: sendEmailMock }));

const { prisma } = await import('~/utils/db.server');
const { setApprovalHooks } = await import('./approval-hooks.server');
const {
  completeSchoolAdminApproval,
  createFreeTierTeacherAccount,
  redirectSchoolAdmin,
  resendFreeTierAdminApprovalReminder,
  submitAdminDetails,
} = await import('./approval-flow.server');
const { mintSignedLink, peekSignedLink, RELEASE_LINK_TTL_MS } = await import('./signed-link.server');
const { getPasswordHash } = await import('~/utils/auth.server');

const enabled = process.env.FREE_TIER_DB_TESTS === '1';

describe('free-tier approval flow', () => {
  if (!enabled) {
    test.skip('requires FREE_TIER_DB_TESTS', () => {});
    return;
  }

  const secret = process.env.FREE_TIER_LINK_HMAC_SECRET;
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      status: 'success' as const,
      data: { id: 'integration-test-email' },
    });
    process.env.FREE_TIER_LINK_HMAC_SECRET =
      secret || 'integration-test-free-tier-link-secret-key';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
  });
  afterEach(() => {
    if (secret === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    else process.env.FREE_TIER_LINK_HMAC_SECRET = secret;
    setApprovalHooks({});
  });

  test('account → admin submit → approve calls hook once (idempotent second click)', async () => {
    let hookCalls = 0;
    setApprovalHooks({
      onApplicationApproved: async () => {
        hookCalls += 1;
      },
    });
    const email = `ft-flow-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Flow Teacher',
        schoolName: 'Flow HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Flow Teacher' },
            select: { id: true },
          })
        ).id,
      },
    });
    const submit = await submitAdminDetails({
      applicationId: app.id,
      userId: app.userId!,
      adminName: 'Principal Pat',
      adminEmail: 'principal@school.edu',
      adminRole: 'Principal',
    });
    expect(submit.ok, JSON.stringify(submit)).toBe(true);
    const emailLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval', success: true },
      orderBy: { createdAt: 'desc' },
    });
    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)?.approveUrl;
    const approveToken = approveUrl ? new URL(approveUrl).searchParams.get('t') : null;
    if (!approveToken) throw new Error('missing emailed approve token');
    const req = new Request('https://yawp.test/free/admin/approve', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.1' },
    });
    const first = await completeSchoolAdminApproval({
      token: approveToken,
      adminRole: 'Principal',
      authorized: true,
      request: req,
    });
    expect(first.ok).toBe(true);
    const second = await completeSchoolAdminApproval({
      token: approveToken,
      adminRole: 'Principal',
      authorized: true,
      request: req,
    });
    expect(second.ok).toBe(true);
    expect('idempotent' in second && second.idempotent).toBe(true);
    expect(hookCalls).toBe(1);
    const finalApp = await prisma.freeTierApplication.findUnique({ where: { id: app.id } });
    expect(finalApp?.status).toBe('APPROVED');
  });

  test('concurrent approve clicks: only one consumes the signed link', async () => {
    setApprovalHooks({ onApplicationApproved: async () => {} });
    const email = `ft-race-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Race Teacher',
        schoolName: 'Race HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Race Teacher' },
            select: { id: true },
          })
        ).id,
      },
    });
    const submit = await submitAdminDetails({
      applicationId: app.id,
      userId: app.userId!,
      adminName: 'Principal Pat',
      adminEmail: 'principal@school.edu',
      adminRole: 'Principal',
    });
    expect(submit.ok).toBe(true);
    const emailLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval', success: true },
      orderBy: { createdAt: 'desc' },
    });
    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)?.approveUrl;
    const approveToken = approveUrl ? new URL(approveUrl).searchParams.get('t') : null;
    if (!approveToken) throw new Error('missing emailed approve token');
    const req = new Request('https://yawp.test/free/admin/approve', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.2' },
    });
    const [first, second] = await Promise.all([
      completeSchoolAdminApproval({
        token: approveToken,
        adminRole: 'Principal',
        authorized: true,
        request: req,
      }),
      completeSchoolAdminApproval({
        token: approveToken,
        adminRole: 'Principal',
        authorized: true,
        request: req,
      }),
    ]);
    const outcomes = [first, second];
    const freshApprovals = outcomes.filter(
      (r) => r.ok && 'app' in r && r.app && !('idempotent' in r && r.idempotent)
    );
    const idempotent = outcomes.filter((r) => r.ok && 'idempotent' in r && r.idempotent);
    const linkLost = outcomes.filter((r) => !r.ok && r.reason === 'used');
    expect(freshApprovals.length).toBe(1);
    expect(idempotent.length + linkLost.length).toBe(1);
    const finalApp = await prisma.freeTierApplication.findUnique({ where: { id: app.id } });
    expect(finalApp?.status).toBe('APPROVED');
  });

  test('not-right-person forward emails the new administrator', async () => {
    const email = `ft-forward-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Forward Teacher',
        schoolName: 'Forward HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Forward Teacher' },
            select: { id: true },
          })
        ).id,
      },
    });
    const submit = await submitAdminDetails({
      applicationId: app.id,
      userId: app.userId!,
      adminName: 'Wrong Person',
      adminEmail: 'wrong@school.edu',
      adminRole: 'Principal',
    });
    expect(submit.ok).toBe(true);
    const emailLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval', success: true },
      orderBy: { createdAt: 'desc' },
    });
    const declineUrl = (emailLog?.payload as { notRightPersonUrl?: string } | null)?.notRightPersonUrl;
    const declineToken = declineUrl ? new URL(declineUrl).searchParams.get('t') : null;
    if (!declineToken) throw new Error('missing decline token in email log');

    const req = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.3' },
    });
    const forwarded = await redirectSchoolAdmin({
      token: declineToken,
      newAdminName: 'Right Principal',
      newAdminEmail: 'principal@school.edu',
      request: req,
    });
    expect(forwarded.ok).toBe(true);

    const pending = await prisma.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    expect(pending?.adminEmail).toBe('principal@school.edu');

    const reminderLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval', success: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(reminderLog?.toEmail).toBe('principal@school.edu');
  });

  test('resend reminder invalidates previous approve and decline links', async () => {
    const email = `ft-resend-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Resend Teacher',
        schoolName: 'Resend HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Resend Teacher' },
            select: { id: true },
          })
        ).id,
      },
    });
    const submit = await submitAdminDetails({
      applicationId: app.id,
      userId: app.userId!,
      adminName: 'Principal Pat',
      adminEmail: 'principal@school.edu',
      adminRole: 'Principal',
    });
    expect(submit.ok).toBe(true);
    const firstLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval', success: true },
      orderBy: { createdAt: 'desc' },
    });
    const oldApproveUrl = (firstLog?.payload as { approveUrl?: string } | null)?.approveUrl;
    const oldDeclineUrl = (firstLog?.payload as { notRightPersonUrl?: string } | null)?.notRightPersonUrl;
    const oldApproveToken = oldApproveUrl ? new URL(oldApproveUrl).searchParams.get('t') : null;
    const oldDeclineToken = oldDeclineUrl ? new URL(oldDeclineUrl).searchParams.get('t') : null;
    if (!oldApproveToken || !oldDeclineToken) throw new Error('missing initial tokens');

    const req = new Request('https://yawp.test/app/free-tier/pending', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.5' },
    });
    const resent = await resendFreeTierAdminApprovalReminder({ applicationId: app.id, request: req });
    expect(resent.ok).toBe(true);

    const oldApprovePeek = await peekSignedLink({ token: oldApproveToken, expectedPurpose: 'ADMIN_APPROVE' });
    expect(oldApprovePeek.ok).toBe(false);
    if (oldApprovePeek.ok) throw new Error('old approve should be invalid');
    expect(['used', 'superseded']).toContain(oldApprovePeek.reason);

    const oldDeclinePeek = await peekSignedLink({
      token: oldDeclineToken,
      expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    expect(oldDeclinePeek.ok).toBe(false);
    if (oldDeclinePeek.ok) throw new Error('old decline should be invalid');
    expect(oldDeclinePeek.reason).toBe('used');

    const reminderLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval_reminder', success: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(reminderLog).not.toBeNull();
  });

  test('forward invalidates previous approve link and consumes decline link', async () => {
    const email = `ft-forward-links-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Link Teacher',
        schoolName: 'Link HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Link Teacher' },
            select: { id: true },
          })
        ).id,
      },
    });
    const submit = await submitAdminDetails({
      applicationId: app.id,
      userId: app.userId!,
      adminName: 'Wrong Person',
      adminEmail: 'wrong@school.edu',
      adminRole: 'Principal',
    });
    expect(submit.ok).toBe(true);
    const firstLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval', success: true },
      orderBy: { createdAt: 'desc' },
    });
    const oldApproveUrl = (firstLog?.payload as { approveUrl?: string } | null)?.approveUrl;
    const oldDeclineUrl = (firstLog?.payload as { notRightPersonUrl?: string } | null)?.notRightPersonUrl;
    const oldApproveToken = oldApproveUrl ? new URL(oldApproveUrl).searchParams.get('t') : null;
    const oldDeclineToken = oldDeclineUrl ? new URL(oldDeclineUrl).searchParams.get('t') : null;
    if (!oldApproveToken || !oldDeclineToken) throw new Error('missing initial tokens');

    const req = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.6' },
    });
    const forwarded = await redirectSchoolAdmin({
      token: oldDeclineToken,
      newAdminName: 'Right Principal',
      newAdminEmail: 'principal@school.edu',
      request: req,
    });
    expect(forwarded.ok).toBe(true);

    const oldApprovePeek = await peekSignedLink({ token: oldApproveToken, expectedPurpose: 'ADMIN_APPROVE' });
    expect(oldApprovePeek.ok).toBe(false);

    const oldDeclinePeek = await peekSignedLink({
      token: oldDeclineToken,
      expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    expect(oldDeclinePeek.ok).toBe(false);
    if (oldDeclinePeek.ok) throw new Error('decline should be consumed');
    expect(oldDeclinePeek.reason).toBe('used');

    const forwardLog = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, toEmail: 'principal@school.edu', success: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(forwardLog?.kind).toBe('admin_approval');
    const newApproveUrl = (forwardLog?.payload as { approveUrl?: string } | null)?.approveUrl;
    const newApproveToken = newApproveUrl ? new URL(newApproveUrl).searchParams.get('t') : null;
    if (!newApproveToken) throw new Error('missing new approve token');
    const newPeek = await peekSignedLink({ token: newApproveToken, expectedPurpose: 'ADMIN_APPROVE' });
    expect(newPeek.ok).toBe(true);
  });

  test('not-right-person forward does not consume link when pending approval is missing', async () => {
    const email = `ft-forward-fail-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Fail Forward',
        schoolName: 'Fail HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'SENT',
      },
    });
    const declineMint = await import('./signed-link.server').then((m) =>
      m.mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_NOT_RIGHT_PERSON' })
    );
    const req = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.4' },
    });
    const result = await redirectSchoolAdmin({
      token: declineMint.token,
      newAdminName: 'Someone',
      newAdminEmail: 'someone@school.edu',
      request: req,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('not_found');

    const link = await prisma.freeTierSignedLink.findUnique({
      where: { id: declineMint.linkId },
      select: { usedAt: true },
    });
    expect(link?.usedAt).toBeNull();
  });

  test('release join consumes link only after account creation succeeds', async () => {
    const email = `ft-release-join-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Release Join',
        schoolName: 'Join HS',
        location: 'TX',
        gradeLevel: '10',
        status: 'INVITED',
        releasedAt: new Date(),
      },
    });
    const minted = await mintSignedLink({
      applicationId: app.id,
      purpose: 'RELEASE',
      ttlMs: RELEASE_LINK_TTL_MS,
    });
    const passwordHash = await getPasswordHash('yawp-ft-join-pass');
    const created = await createFreeTierTeacherAccount({
      token: minted.token,
      name: 'Release Join',
      passwordHash,
    });
    expect(created.ok).toBe(true);
    const after = await peekSignedLink({ token: minted.token, expectedPurpose: 'RELEASE' });
    expect(after.ok).toBe(false);
    if (after.ok) throw new Error('expected used link');
    expect(after.reason).toBe('used');
  });

  test('release join does not consume link when an existing password must sign in', async () => {
    const email = `ft-release-existing-${Date.now()}@school.edu`;
    await prisma.user.create({
      data: {
        email,
        name: 'Existing',
        password: { create: { hash: await getPasswordHash('existing-pass') } },
      },
    });
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Existing',
        schoolName: 'Join HS',
        location: 'TX',
        gradeLevel: '10',
        status: 'INVITED',
        releasedAt: new Date(),
      },
    });
    const minted = await mintSignedLink({
      applicationId: app.id,
      purpose: 'RELEASE',
      ttlMs: RELEASE_LINK_TTL_MS,
    });
    const created = await createFreeTierTeacherAccount({
      token: minted.token,
      name: 'Existing',
      passwordHash: await getPasswordHash('new-pass'),
    });
    expect(created).toEqual({ ok: false, reason: 'sign_in_required' });
    const after = await peekSignedLink({ token: minted.token, expectedPurpose: 'RELEASE' });
    expect(after.ok).toBe(true);
  });

  test('release join completes signup for a passwordless user with the same email', async () => {
    const email = `ft-release-nopw-${Date.now()}@school.edu`;
    const orphan = await prisma.user.create({
      data: { email, name: 'Orphan' },
    });
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Orphan Teacher',
        schoolName: 'Join HS',
        location: 'TX',
        gradeLevel: '10',
        status: 'INVITED',
        releasedAt: new Date(),
      },
    });
    const minted = await mintSignedLink({
      applicationId: app.id,
      purpose: 'RELEASE',
      ttlMs: RELEASE_LINK_TTL_MS,
    });
    const created = await createFreeTierTeacherAccount({
      token: minted.token,
      name: 'Orphan Teacher',
      passwordHash: await getPasswordHash('fresh-pass'),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('expected success');
    expect(created.userId).toBe(orphan.id);
    const withPassword = await prisma.user.findUnique({
      where: { id: orphan.id },
      select: { password: { select: { userId: true } } },
    });
    expect(withPassword?.password?.userId).toBe(orphan.id);
  });
});
