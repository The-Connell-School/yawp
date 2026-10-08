// FREE_TIER_DB_TESTS=1 DATABASE_URL=... bun test app/domain/free-tier/approval-flow.integration.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { setApprovalHooks } from './approval-hooks.server';
import {
  completeSchoolAdminApproval,
  redirectSchoolAdmin,
  submitAdminDetails,
} from './approval-flow.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';

describe('free-tier approval flow', () => {
  if (!enabled) {
    test.skip('requires FREE_TIER_DB_TESTS', () => {});
    return;
  }

  const secret = process.env.FREE_TIER_LINK_HMAC_SECRET;
  beforeEach(() => {
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
    expect(submit.ok).toBe(true);
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
});
