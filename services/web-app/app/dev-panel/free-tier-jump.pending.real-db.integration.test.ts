import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const enabled = Boolean(process.env.DATABASE_URL);
const sendEmail = mock(async () => ({ status: 'success' as const }));

mock.module('~/utils/email.server', () => ({
  sendEmail,
  getTransactionalEmailFrom: () => 'transactional-from@example.org',
}));

const userIds: string[] = [];
const appIds: string[] = [];
const orgIds: string[] = [];

async function loadJump() {
  return import('./free-tier-jump.server');
}

async function loadPrisma() {
  return import('~/utils/db.server').then((m) => m.prisma);
}

async function enableFreeTierFlag(prisma: Awaited<ReturnType<typeof loadPrisma>>) {
  await prisma.setting.upsert({
    where: { name: 'feature_flag.free_tier' },
    create: {
      name: 'feature_flag.free_tier',
      value: 'true',
      valueType: 'boolean',
    },
    update: { value: 'true' },
  });
}

async function defaultOrg(prisma: Awaited<ReturnType<typeof loadPrisma>>) {
  const org =
    (await prisma.organization.findUnique({
      where: { id: 'default-org' },
      select: { id: true },
    })) ??
    (await prisma.organization.create({
      data: { id: 'default-org', name: 'Default org', plan: 'SCHOOL' },
      select: { id: true },
    }));
  orgIds.push(org.id);
  return org.id;
}

describe.skipIf(!enabled)('executeFreeTierStateJump pending states (real db)', () => {
  beforeEach(() => {
    sendEmail.mockClear();
    process.env.FREE_TIER_LINK_HMAC_SECRET ??=
      'local-dev-panel-jump-test-signing-secret';
    process.env.PRIMARY_APP_URL ??= 'http://localhost:5173';
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.PREVIEW_SLUG;
  });

  afterAll(async () => {
    const prisma = await loadPrisma();
    await prisma.freeTierApprovalDelivery.deleteMany({
      where: { approval: { applicationId: { in: appIds } } },
    });
    await prisma.freeTierAdminApproval.deleteMany({
      where: { applicationId: { in: appIds } },
    });
    await prisma.freeTierEmailLog.deleteMany({
      where: { applicationId: { in: appIds } },
    });
    await prisma.freeTierApplication.deleteMany({ where: { id: { in: appIds } } });
    await prisma.orgMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.class.deleteMany({
      where: { school: { organizationId: { in: orgIds } } },
    });
    await prisma.school.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: orgIds.filter((id) => id !== 'default-org') } },
    });
  });

  test('sendEmail mock positive control', async () => {
    const { sendEmail: wiredSend } = await import('~/utils/email.server');
    await wiredSend({
      to: 'control@example.test',
      subject: 'control',
      text: 'control',
      html: '<p>control</p>',
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test('waiting-on-admin throwaway matches pending loader without SES', async () => {
    const prisma = await loadPrisma();
    const { executeFreeTierStateJump } = await loadJump();
    await enableFreeTierFlag(prisma);
    const organizationId = await defaultOrg(prisma);

    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: true,
      currentUserId: null,
      organizationId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.throwawayEmail).toMatch(
      /^dev-panel\+[0-9a-f-]{36}@pending-[0-9a-f-]{12}\.example\.test$/
    );
    expect(sendEmail).not.toHaveBeenCalled();

    const user = await prisma.user.findFirst({
      where: { email: result.throwawayEmail },
      select: { id: true },
    });
    expect(user?.id).toBeTruthy();
    userIds.push(user!.id);

    const app = await prisma.freeTierApplication.findFirst({
      where: { userId: user!.id },
      select: { id: true, status: true, organizationId: true },
    });
    expect(app?.status).toBe('SENT');
    expect(app?.organizationId).toBeTruthy();
    if (app) {
      appIds.push(app.id);
      if (app.organizationId) orgIds.push(app.organizationId);
    }

    mock.module('~/utils/auth.server', () => ({
      requireUserId: async () => user!.id,
    }));
    mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
      requireFreeTierEnabled: async () => {},
    }));

    const { loader: pendingLoader } = await import(
      '~/routes/app.free-tier.pending/route'
    );
    const data = await pendingLoader({
      request: new Request('http://localhost/app/free-tier/pending'),
    } as never);

    expect(data.pending?.adminName).toBe('Dr. Alan Brooks');
    expect(data.pending?.adminEmail).toMatch(/^admin\.fixture@pending-/);
    expect(data.approvalV2?.approval?.adminEmail).toBe(data.pending?.adminEmail);
    expect(data.showExploreClassroom).toBe(true);
  });

  test('manual-review throwaway reaches MANUAL_REVIEW under demo runtime', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    process.env.PREVIEW_SLUG = 'demo';
    const prisma = await loadPrisma();
    const { executeFreeTierStateJump } = await loadJump();
    await enableFreeTierFlag(prisma);
    const organizationId = await defaultOrg(prisma);

    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.manual-review',
      throwaway: true,
      currentUserId: null,
      organizationId,
    });
    expect(result.ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();

    const user = await prisma.user.findFirst({
      where: { email: result.ok ? result.throwawayEmail : undefined },
      select: { id: true },
    });
    if (user) userIds.push(user.id);
    const app = await prisma.freeTierApplication.findFirst({
      where: { userId: user?.id },
      select: { id: true, status: true },
    });
    expect(app?.status).toBe('MANUAL_REVIEW');
    if (app) appIds.push(app.id);
  });

  test('signed-in pending jump is refused without mutating the user', async () => {
    const prisma = await loadPrisma();
    const { executeFreeTierStateJump, PENDING_STATES_NEED_THROWAWAY } =
      await loadJump();
    const organizationId = await defaultOrg(prisma);
    const email = `signed-in-pending-refuse-${randomUUID()}@yawp.local`;
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Signed-in teacher',
        memberships: {
          create: {
            organizationId,
            role: 'TEACHER',
            isActive: true,
          },
        },
      },
      select: { id: true },
    });
    userIds.push(user.id);
    const membershipsBefore = await prisma.orgMembership.count({
      where: { userId: user.id },
    });

    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: false,
      currentUserId: user.id,
      organizationId,
    });
    expect(result).toEqual({
      ok: false,
      error: PENDING_STATES_NEED_THROWAWAY,
    });
    expect(sendEmail).not.toHaveBeenCalled();

    const userAfter = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    expect(userAfter?.email).toBe(email);
    expect(
      await prisma.orgMembership.count({ where: { userId: user.id } })
    ).toBe(membershipsBefore);
  });
});
