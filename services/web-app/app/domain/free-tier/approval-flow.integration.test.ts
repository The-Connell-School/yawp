// FREE_TIER_DB_TESTS=1 DATABASE_URL=... bun test app/domain/free-tier/approval-flow.integration.test.ts
// Release-join tests use bcrypt directly so auth.server mocks cannot break hashing.
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import bcrypt from 'bcryptjs';

const sendEmailMock = mock(async (_options: any) => ({
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
const { mintSignedLink, peekSignedLink, RELEASE_LINK_TTL_MS } =
  await import('./signed-link.server');
const { saveClassPreparation } = await import('./class-preparation.server');

const enabled = process.env.FREE_TIER_DB_TESTS === '1';

async function testPasswordHash(password: string) {
  return bcrypt.hash(password, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('free-tier approval flow', () => {
  if (!enabled) {
    test.skip('requires FREE_TIER_DB_TESTS', () => {});
    return;
  }

  const secret = process.env.FREE_TIER_LINK_HMAC_SECRET;
  const budgetEnv = process.env.FREE_TIER_BUDGET_ENVIRONMENT;
  const previewBudget = process.env.FREE_TIER_PREVIEW_BUDGET_USD;
  const previewUnitCost = process.env.FREE_TIER_PREVIEW_UNIT_COST_USD;
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      status: 'success' as const,
      data: { id: 'integration-test-email' },
    });
    process.env.FREE_TIER_LINK_HMAC_SECRET =
      secret || 'integration-test-free-tier-link-secret-key';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    if (budgetEnv === undefined)
      delete process.env.FREE_TIER_BUDGET_ENVIRONMENT;
    else process.env.FREE_TIER_BUDGET_ENVIRONMENT = budgetEnv;
    if (previewBudget === undefined)
      delete process.env.FREE_TIER_PREVIEW_BUDGET_USD;
    else process.env.FREE_TIER_PREVIEW_BUDGET_USD = previewBudget;
    if (previewUnitCost === undefined)
      delete process.env.FREE_TIER_PREVIEW_UNIT_COST_USD;
    else process.env.FREE_TIER_PREVIEW_UNIT_COST_USD = previewUnitCost;
  });
  afterEach(async () => {
    if (secret === undefined) delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    else process.env.FREE_TIER_LINK_HMAC_SECRET = secret;
    if (budgetEnv === undefined)
      delete process.env.FREE_TIER_BUDGET_ENVIRONMENT;
    else process.env.FREE_TIER_BUDGET_ENVIRONMENT = budgetEnv;
    if (previewBudget === undefined)
      delete process.env.FREE_TIER_PREVIEW_BUDGET_USD;
    else process.env.FREE_TIER_PREVIEW_BUDGET_USD = previewBudget;
    if (previewUnitCost === undefined)
      delete process.env.FREE_TIER_PREVIEW_UNIT_COST_USD;
    else process.env.FREE_TIER_PREVIEW_UNIT_COST_USD = previewUnitCost;
    setApprovalHooks({});
    const apps = await prisma.freeTierApplication.findMany({
      where: { email: { endsWith: '@school.edu' } },
      select: { id: true, userId: true, organizationId: true },
    });
    const appIds = apps.map((row) => row.id);
    const userIds = apps.map((row) => row.userId).filter(Boolean) as string[];
    const orgIds = apps
      .map((row) => row.organizationId)
      .filter(Boolean) as string[];
    if (appIds.length > 0) {
      await prisma.freeTierSignedLink.deleteMany({
        where: { applicationId: { in: appIds } },
      });
      await prisma.freeTierEmailLog.deleteMany({
        where: { applicationId: { in: appIds } },
      });
      await prisma.freeTierAdminApproval.deleteMany({
        where: { applicationId: { in: appIds } },
      });
      await prisma.freeTierApprovalDecision.deleteMany({
        where: { applicationId: { in: appIds } },
      });
      await prisma.freeTierApplication.deleteMany({
        where: { id: { in: appIds } },
      });
    }
    if (orgIds.length > 0) {
      await prisma.class.deleteMany({
        where: { school: { organizationId: { in: orgIds } } },
      });
      await prisma.school.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.organizationAssignmentType.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.orgMembership.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    if (userIds.length > 0) {
      await prisma.orgMembership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.password.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  for (const environment of ['demo', 'production', 'preview'] as const) {
    test(`${environment}: fixed initial, reminder and replacement email through real approval flow`, async () => {
      const oldEnvironment = process.env.YAWP_ENVIRONMENT;
      const oldSlug = process.env.PREVIEW_SLUG;
      const oldBudgetEnvironment = process.env.FREE_TIER_BUDGET_ENVIRONMENT;
      process.env.YAWP_ENVIRONMENT = environment;
      process.env.PREVIEW_SLUG =
        environment === 'demo'
          ? 'demo'
          : environment === 'preview'
            ? 'pr-999'
            : '';
      process.env.FREE_TIER_BUDGET_ENVIRONMENT = 'preview';
      setApprovalHooks({ onApplicationApproved: async () => {} });
      const { isApprovalV2Enabled, runApprovalJobs } =
        await import('./approval-v2.server');
      try {
        const email = `ft-fixed-${Date.now()}@school.edu`;
        const user = await prisma.user.create({
          data: { email, name: 'Local Teacher' },
        });
        const app = await prisma.freeTierApplication.create({
          data: {
            email,
            userId: user.id,
            name: user.name!,
            schoolName: 'Example High',
            location: 'Local',
            gradeLevel: '10',
            status: 'ACCOUNT_CREATED',
          },
        });
        if (environment !== 'production') {
          expect(
            (
              await saveClassPreparation({
                applicationId: app.id,
                userId: user.id,
                className: 'English 10',
                grade: '10',
              })
            ).ok
          ).toBe(true);
        }
        const approvalIdentity = {
          id: app.id,
          userId: user.id,
          organizationId: app.organizationId,
        };
        const approvalV2 = await isApprovalV2Enabled(approvalIdentity);
        const findDeliveryTo = (to: string) => {
          const deliveries = sendEmailMock.mock.calls
            .map((call) => call[0])
            .filter((delivery) => delivery.to === to);
          expect(deliveries.length).toBeGreaterThan(0);
          return deliveries.at(-1)!;
        };
        const checkDelivery = (
          to: string,
          options: { expectDemoBcc?: boolean } = {}
        ) => {
          const delivery = findDeliveryTo(to);
          if (options.expectDemoBcc && environment === 'demo') {
            expect(delivery.bcc).toEqual([email]);
          } else if (!approvalV2) {
            expect(delivery).not.toHaveProperty('bcc');
          }
          expect(delivery.text.includes('CRAFTED INTRO')).toBe(false);
          expect(delivery.text.includes('HISTORICAL INTRO')).toBe(false);
          expect(delivery.text).toContain('/free/admin/approve?t=');
          expect(delivery.text).toContain('/free/admin/not-right-person?t=');
          return delivery;
        };
        expect(
          (
            await submitAdminDetails({
              applicationId: app.id,
              userId: user.id,
              adminName: 'Principal Pat',
              adminEmail: 'principal@school.edu',
              adminRole: 'Principal',
              personalNote: 'CRAFTED INTRO',
            })
          ).ok
        ).toBe(true);
        checkDelivery('principal@school.edu', { expectDemoBcc: true });
        await prisma.freeTierAdminApproval.updateMany({
          where: { applicationId: app.id },
          data: { personalNote: 'HISTORICAL INTRO' },
        });
        const request = new Request('https://yawp.test/free/admin/approve');
        expect(
          (
            await resendFreeTierAdminApprovalReminder({
              applicationId: app.id,
              request,
            })
          ).ok
        ).toBe(true);
        const reminder = checkDelivery('principal@school.edu');
        const declineUrl = reminder.text
          .split('\n')
          .find((line: string) =>
            line.includes('/free/admin/not-right-person?t=')
          )!;
        expect(
          (
            await redirectSchoolAdmin({
              token: new URL(declineUrl).searchParams.get('t')!,
              newAdminName: 'Principal Lee',
              newAdminEmail: 'replacement@school.edu',
              request,
            })
          ).ok
        ).toBe(true);
        if (approvalV2) await runApprovalJobs(new Date());
        const replacement = checkDelivery('replacement@school.edu');
        expect(replacement.text).toContain('Hi Principal Lee,');
        const approveUrl = replacement.text
          .split('\n')
          .find((line: string) => line.includes('/free/admin/approve?t='))!;
        expect(
          (
            await completeSchoolAdminApproval({
              token: new URL(approveUrl).searchParams.get('t')!,
              authorized: true,
              adminRole: 'Principal',
              request,
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await prisma.freeTierApplication.findUnique({
              where: { id: app.id },
            })
          )?.status
        ).toBe('APPROVED');
        const congratulations = sendEmailMock.mock.calls.at(-1)![0];
        expect(congratulations.to).toBe(email);
        expect(congratulations).not.toHaveProperty('bcc');
      } finally {
        for (const [key, value] of Object.entries({
          YAWP_ENVIRONMENT: oldEnvironment,
          PREVIEW_SLUG: oldSlug,
          FREE_TIER_BUDGET_ENVIRONMENT: oldBudgetEnvironment,
        })) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
  }

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
    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const approveToken = approveUrl
      ? new URL(approveUrl).searchParams.get('t')
      : null;
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
    const finalApp = await prisma.freeTierApplication.findUnique({
      where: { id: app.id },
    });
    expect(finalApp?.status).toBe('APPROVED');
  });

  test('school admin approval succeeds when an already-counted application fills the budget', async () => {
    process.env.FREE_TIER_BUDGET_ENVIRONMENT = 'preview';
    process.env.FREE_TIER_PREVIEW_BUDGET_USD = '0';
    process.env.FREE_TIER_PREVIEW_UNIT_COST_USD = '1';
    let hookCalls = 0;
    setApprovalHooks({
      onApplicationApproved: async () => {
        hookCalls += 1;
      },
    });
    const email = `ft-budget-deny-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Budget Teacher',
        schoolName: 'Budget HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Budget Teacher' },
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
    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const approveToken = approveUrl
      ? new URL(approveUrl).searchParams.get('t')
      : null;
    if (!approveToken) throw new Error('missing emailed approve token');
    const linkId = (
      await prisma.freeTierSignedLink.findFirst({
        where: { applicationId: app.id, purpose: 'ADMIN_APPROVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )?.id;
    if (!linkId) throw new Error('missing approve link row');

    const req = new Request('https://yawp.test/free/admin/approve', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.8' },
    });
    const result = await completeSchoolAdminApproval({
      token: approveToken,
      adminRole: 'Principal',
      authorized: true,
      request: req,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(hookCalls).toBe(1);

    const link = await prisma.freeTierSignedLink.findUnique({
      where: { id: linkId },
      select: { usedAt: true },
    });
    expect(link?.usedAt).toBeInstanceOf(Date);
    const pending = await prisma.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, signedLinkId: linkId },
      select: { status: true, decidedAt: true },
    });
    expect(pending?.status).toBe('APPROVED');
    expect(pending?.decidedAt).toBeInstanceOf(Date);
    const finalApp = await prisma.freeTierApplication.findUnique({
      where: { id: app.id },
    });
    expect(finalApp?.status).toBe('APPROVED');
  });

  test('concurrent administrator approvals wait for the release budget lock at the boundary', async () => {
    process.env.FREE_TIER_BUDGET_ENVIRONMENT = 'preview';
    process.env.FREE_TIER_PREVIEW_BUDGET_USD = '2';
    process.env.FREE_TIER_PREVIEW_UNIT_COST_USD = '1';
    setApprovalHooks({ onApplicationApproved: async () => {} });

    async function createPendingApproval(suffix: string) {
      const email = `ft-budget-race-${suffix}-${Date.now()}@school.edu`;
      const app = await prisma.freeTierApplication.create({
        data: {
          email,
          name: `Budget Race ${suffix}`,
          schoolName: 'Budget Race HS',
          location: 'NY',
          gradeLevel: '9',
          status: 'ACCOUNT_CREATED',
          userId: (
            await prisma.user.create({
              data: { email, name: `Budget Race ${suffix}` },
              select: { id: true },
            })
          ).id,
        },
      });
      const submit = await submitAdminDetails({
        applicationId: app.id,
        userId: app.userId!,
        adminName: 'Principal Pat',
        adminEmail: `principal-${suffix}@school.edu`,
        adminRole: 'Principal',
      });
      expect(submit.ok, JSON.stringify(submit)).toBe(true);
      const emailLog = await prisma.freeTierEmailLog.findFirst({
        where: { applicationId: app.id, kind: 'admin_approval', success: true },
        orderBy: { createdAt: 'desc' },
      });
      const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)
        ?.approveUrl;
      const approveToken = approveUrl
        ? new URL(approveUrl).searchParams.get('t')
        : null;
      if (!approveToken) throw new Error('missing emailed approve token');
      return { appId: app.id, approveToken };
    }

    const first = await createPendingApproval('one');
    const second = await createPendingApproval('two');
    let releaseLock!: () => void;
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockTransaction = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_release'))`;
      locked();
      await release;
    });
    await lockHeld;

    const req = new Request('https://yawp.test/free/admin/approve', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.10' },
    });
    const approvals = Promise.all([
      completeSchoolAdminApproval({
        token: first.approveToken,
        adminRole: 'Principal',
        authorized: true,
        request: req,
      }),
      completeSchoolAdminApproval({
        token: second.approveToken,
        adminRole: 'Principal',
        authorized: true,
        request: req,
      }),
    ]);

    try {
      const lockState = await Promise.race([
        approvals.then(() => 'completed' as const),
        sleep(100).then(() => 'waiting' as const),
      ]);
      expect(lockState).toBe('waiting');
    } finally {
      releaseLock();
      await lockTransaction;
    }
    const results = await approvals;
    expect(results.every((result) => result.ok)).toBe(true);

    const approved = await prisma.freeTierApplication.count({
      where: { id: { in: [first.appId, second.appId] }, status: 'APPROVED' },
    });
    expect(approved).toBe(2);
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
    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const approveToken = approveUrl
      ? new URL(approveUrl).searchParams.get('t')
      : null;
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
    const idempotent = outcomes.filter(
      (r) => r.ok && 'idempotent' in r && r.idempotent
    );
    const linkLost = outcomes.filter((r) => !r.ok && r.reason === 'used');
    expect(freshApprovals.length).toBe(1);
    expect(idempotent.length + linkLost.length).toBe(1);
    const finalApp = await prisma.freeTierApplication.findUnique({
      where: { id: app.id },
    });
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
    const declineUrl = (
      emailLog?.payload as { notRightPersonUrl?: string } | null
    )?.notRightPersonUrl;
    const declineToken = declineUrl
      ? new URL(declineUrl).searchParams.get('t')
      : null;
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

  test('not-right-person forward on approved application returns already_approved without consuming the link', async () => {
    const email = `ft-forward-approved-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Approved Forward Teacher',
        schoolName: 'Approved Forward HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Approved Forward Teacher' },
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
    const declineUrl = (
      emailLog?.payload as { notRightPersonUrl?: string } | null
    )?.notRightPersonUrl;
    const declineToken = declineUrl
      ? new URL(declineUrl).searchParams.get('t')
      : null;
    if (!declineToken) throw new Error('missing decline token');
    const linkId = (
      await prisma.freeTierSignedLink.findFirst({
        where: {
          applicationId: app.id,
          purpose: 'ADMIN_NOT_RIGHT_PERSON',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )?.id;
    if (!linkId) throw new Error('missing decline link row');

    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const approveToken = approveUrl
      ? new URL(approveUrl).searchParams.get('t')
      : null;
    if (!approveToken) throw new Error('missing approve token');
    const req = new Request('https://yawp.test/free/admin/approve', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.50' },
    });
    const approved = await completeSchoolAdminApproval({
      token: approveToken,
      adminRole: 'Principal',
      authorized: true,
      request: req,
    });
    expect(approved.ok).toBe(true);

    const forwardReq = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.51' },
    });
    const forwarded = await redirectSchoolAdmin({
      token: declineToken,
      newAdminName: 'Too Late Principal',
      newAdminEmail: 'late@school.edu',
      request: forwardReq,
    });
    expect(forwarded.ok).toBe(false);
    if (forwarded.ok) throw new Error('expected already_approved');
    expect(forwarded).toMatchObject({
      reason: 'already_approved',
      schoolName: 'Approved Forward HS',
    });
    const declineLink = await prisma.freeTierSignedLink.findUnique({
      where: { id: linkId },
      select: { usedAt: true },
    });
    expect(declineLink?.usedAt).toBeNull();
  });

  test('not-right-person GET and HEAD-style peeks then POST still forwards without consuming links early', async () => {
    const email = `ft-forward-peek-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Peek Forward Teacher',
        schoolName: 'Peek Forward HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Peek Forward Teacher' },
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
    const declineUrl = (
      emailLog?.payload as { notRightPersonUrl?: string } | null
    )?.notRightPersonUrl;
    const declineToken = declineUrl
      ? new URL(declineUrl).searchParams.get('t')
      : null;
    if (!declineToken) throw new Error('missing decline token');

    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const approveToken = approveUrl
      ? new URL(approveUrl).searchParams.get('t')
      : null;
    if (!approveToken) throw new Error('missing approve token');
    const declineLinkId = (
      await prisma.freeTierSignedLink.findFirst({
        where: {
          applicationId: app.id,
          purpose: 'ADMIN_NOT_RIGHT_PERSON',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )?.id;
    const approveLinkId = (
      await prisma.freeTierSignedLink.findFirst({
        where: { applicationId: app.id, purpose: 'ADMIN_APPROVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )?.id;
    if (!declineLinkId || !approveLinkId) throw new Error('missing link rows');

    for (const _method of ['GET', 'HEAD'] as const) {
      for (const peekResult of [
        await peekSignedLink({
          token: declineToken,
          expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
        }),
        await peekSignedLink({
          token: approveToken,
          expectedPurpose: 'ADMIN_APPROVE',
        }),
      ]) {
        expect(peekResult.ok).toBe(true);
      }
    }
    const beforeForwardDecline = await prisma.freeTierSignedLink.findUnique({
      where: { id: declineLinkId },
      select: { usedAt: true },
    });
    const beforeForwardApprove = await prisma.freeTierSignedLink.findUnique({
      where: { id: approveLinkId },
      select: { usedAt: true },
    });
    expect(beforeForwardDecline?.usedAt).toBeNull();
    expect(beforeForwardApprove?.usedAt).toBeNull();

    const req = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.52' },
    });
    const forwarded = await redirectSchoolAdmin({
      token: declineToken,
      newAdminName: 'Right Principal',
      newAdminEmail: 'principal@school.edu',
      request: req,
    });
    expect(forwarded.ok).toBe(true);

    const declineLink = await prisma.freeTierSignedLink.findUnique({
      where: { id: declineLinkId },
      select: { usedAt: true },
    });
    const approveLink = await prisma.freeTierSignedLink.findUnique({
      where: { id: approveLinkId },
      select: { usedAt: true },
    });
    expect(declineLink?.usedAt).not.toBeNull();
    expect(approveLink?.usedAt).not.toBeNull();
  });

  test('not-right-person double POST is idempotent', async () => {
    const email = `ft-forward-double-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Double Forward Teacher',
        schoolName: 'Double Forward HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Double Forward Teacher' },
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
    const declineUrl = (
      emailLog?.payload as { notRightPersonUrl?: string } | null
    )?.notRightPersonUrl;
    const declineToken = declineUrl
      ? new URL(declineUrl).searchParams.get('t')
      : null;
    if (!declineToken) throw new Error('missing decline token');
    const req = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.53' },
    });
    const first = await redirectSchoolAdmin({
      token: declineToken,
      newAdminName: 'Right Principal',
      newAdminEmail: 'principal@school.edu',
      request: req,
    });
    expect(first.ok).toBe(true);
    const second = await redirectSchoolAdmin({
      token: declineToken,
      newAdminName: 'Right Principal',
      newAdminEmail: 'principal@school.edu',
      request: req,
    });
    expect(second).toEqual({ ok: true, idempotent: true });
  });

  test('not-right-person invalid token is rejected without consuming a real link', async () => {
    const req = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.55' },
    });
    const result = await redirectSchoolAdmin({
      token: 'not.a.valid.token',
      newAdminName: 'Someone',
      newAdminEmail: 'someone@school.edu',
      request: req,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected invalid token');
    expect(result.reason).toBe('invalid');
  });

  test('not-right-person forward validation rejects bad email without consuming link', async () => {
    const email = `ft-forward-bad-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Bad Email Teacher',
        schoolName: 'Bad Email HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Bad Email Teacher' },
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
    const declineUrl = (
      emailLog?.payload as { notRightPersonUrl?: string } | null
    )?.notRightPersonUrl;
    const declineToken = declineUrl
      ? new URL(declineUrl).searchParams.get('t')
      : null;
    if (!declineToken) throw new Error('missing decline token');
    const linkId = (
      await prisma.freeTierSignedLink.findFirst({
        where: {
          applicationId: app.id,
          purpose: 'ADMIN_NOT_RIGHT_PERSON',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )?.id;
    if (!linkId) throw new Error('missing decline link row');
    const req = new Request('https://yawp.test/free/admin/not-right-person', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.54' },
    });
    const result = await redirectSchoolAdmin({
      token: declineToken,
      newAdminName: 'Someone',
      newAdminEmail: 'not-an-email',
      request: req,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected validation failure');
    expect(result.reason).toBe('validation');
    const declineLink = await prisma.freeTierSignedLink.findUnique({
      where: { id: linkId },
      select: { usedAt: true },
    });
    expect(declineLink?.usedAt).toBeNull();
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
    const oldApproveUrl = (firstLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const oldDeclineUrl = (
      firstLog?.payload as { notRightPersonUrl?: string } | null
    )?.notRightPersonUrl;
    const oldApproveToken = oldApproveUrl
      ? new URL(oldApproveUrl).searchParams.get('t')
      : null;
    const oldDeclineToken = oldDeclineUrl
      ? new URL(oldDeclineUrl).searchParams.get('t')
      : null;
    if (!oldApproveToken || !oldDeclineToken)
      throw new Error('missing initial tokens');

    const req = new Request('https://yawp.test/app/free-tier/pending', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.5' },
    });
    const resent = await resendFreeTierAdminApprovalReminder({
      applicationId: app.id,
      request: req,
    });
    expect(resent.ok).toBe(true);

    const oldApprovePeek = await peekSignedLink({
      token: oldApproveToken,
      expectedPurpose: 'ADMIN_APPROVE',
    });
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
      where: {
        applicationId: app.id,
        kind: 'admin_approval_reminder',
        success: true,
      },
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
    const oldApproveUrl = (firstLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const oldDeclineUrl = (
      firstLog?.payload as { notRightPersonUrl?: string } | null
    )?.notRightPersonUrl;
    const oldApproveToken = oldApproveUrl
      ? new URL(oldApproveUrl).searchParams.get('t')
      : null;
    const oldDeclineToken = oldDeclineUrl
      ? new URL(oldDeclineUrl).searchParams.get('t')
      : null;
    if (!oldApproveToken || !oldDeclineToken)
      throw new Error('missing initial tokens');

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

    const oldApprovePeek = await peekSignedLink({
      token: oldApproveToken,
      expectedPurpose: 'ADMIN_APPROVE',
    });
    expect(oldApprovePeek.ok).toBe(false);

    const oldDeclinePeek = await peekSignedLink({
      token: oldDeclineToken,
      expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    expect(oldDeclinePeek.ok).toBe(false);
    if (oldDeclinePeek.ok) throw new Error('decline should be consumed');
    expect(oldDeclinePeek.reason).toBe('used');

    const forwardLog = await prisma.freeTierEmailLog.findFirst({
      where: {
        applicationId: app.id,
        toEmail: 'principal@school.edu',
        success: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(forwardLog?.kind).toBe('admin_approval');
    const newApproveUrl = (
      forwardLog?.payload as { approveUrl?: string } | null
    )?.approveUrl;
    const newApproveToken = newApproveUrl
      ? new URL(newApproveUrl).searchParams.get('t')
      : null;
    if (!newApproveToken) throw new Error('missing new approve token');
    const newPeek = await peekSignedLink({
      token: newApproveToken,
      expectedPurpose: 'ADMIN_APPROVE',
    });
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
      m.mintSignedLink({
        applicationId: app.id,
        purpose: 'ADMIN_NOT_RIGHT_PERSON',
      })
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
    const passwordHash = await testPasswordHash('yawp-ft-join-pass');
    const created = await createFreeTierTeacherAccount({
      token: minted.token,
      name: 'Release Join',
      passwordHash,
    });
    expect(created.ok).toBe(true);
    const after = await peekSignedLink({
      token: minted.token,
      expectedPurpose: 'RELEASE',
    });
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
        password: { create: { hash: await testPasswordHash('existing-pass') } },
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
      passwordHash: await testPasswordHash('new-pass'),
    });
    expect(created).toEqual({ ok: false, reason: 'sign_in_required' });
    const after = await peekSignedLink({
      token: minted.token,
      expectedPurpose: 'RELEASE',
    });
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
      passwordHash: await testPasswordHash('fresh-pass'),
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

  test('school admin approve on REJECTED application does not consume the link', async () => {
    const email = `ft-reject-approve-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Rejected Teacher',
        schoolName: 'Reject HS',
        location: 'NY',
        gradeLevel: '9',
        status: 'ACCOUNT_CREATED',
        userId: (
          await prisma.user.create({
            data: { email, name: 'Rejected Teacher' },
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
    const approveUrl = (emailLog?.payload as { approveUrl?: string } | null)
      ?.approveUrl;
    const approveToken = approveUrl
      ? new URL(approveUrl).searchParams.get('t')
      : null;
    if (!approveToken) throw new Error('missing emailed approve token');
    const linkId = (
      await prisma.freeTierSignedLink.findFirst({
        where: { applicationId: app.id, purpose: 'ADMIN_APPROVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )?.id;
    if (!linkId) throw new Error('missing approve link row');

    await prisma.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'REJECTED' },
    });

    const req = new Request('https://yawp.test/free/admin/approve', {
      headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.9' },
    });
    const result = await completeSchoolAdminApproval({
      token: approveToken,
      adminRole: 'Principal',
      authorized: true,
      request: req,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'illegal_state',
      status: 'REJECTED',
    });
    const link = await prisma.freeTierSignedLink.findUnique({
      where: { id: linkId },
      select: { usedAt: true },
    });
    expect(link?.usedAt).toBeNull();
    const finalApp = await prisma.freeTierApplication.findUnique({
      where: { id: app.id },
    });
    expect(finalApp?.status).toBe('REJECTED');
  });

  test('release join on non-INVITED application does not consume the link', async () => {
    const email = `ft-release-bad-state-${Date.now()}@school.edu`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Bad State',
        schoolName: 'Join HS',
        location: 'TX',
        gradeLevel: '10',
        status: 'ACCOUNT_CREATED',
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
      name: 'Bad State',
      passwordHash: await testPasswordHash('yawp-ft-join-pass'),
    });
    expect(created).toEqual({
      ok: false,
      reason: 'illegal_state',
      status: 'ACCOUNT_CREATED',
    });
    const link = await prisma.freeTierSignedLink.findUnique({
      where: { id: minted.linkId },
      select: { usedAt: true },
    });
    expect(link?.usedAt).toBeNull();
    const peek = await peekSignedLink({
      token: minted.token,
      expectedPurpose: 'RELEASE',
    });
    expect(peek.ok).toBe(true);
  });
});
