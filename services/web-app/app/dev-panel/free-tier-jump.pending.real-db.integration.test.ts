import { afterAll, describe, expect, mock, test } from 'bun:test';

const enabled = process.env.FREE_TIER_JUMP_DB_TESTS === '1';
const sendEmail = mock(async () => ({ status: 'success' as const }));

mock.module('~/utils/email.server', () => ({
  sendEmail,
  getTransactionalEmailFrom: () => 'transactional-from@example.org',
}));

const userIds: string[] = [];
const appIds: string[] = [];
const orgIds: string[] = [];

describe.skipIf(!enabled)('executeFreeTierStateJump pending states', () => {
  afterAll(async () => {
    mock.restore();
    const { prisma } = await import('~/utils/db.server');
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

  test('waiting-on-admin jump matches pending loader expectations without SES', async () => {
    process.env.FREE_TIER_LINK_HMAC_SECRET ??=
      'local-dev-panel-jump-test-signing-secret';
    process.env.PRIMARY_APP_URL ??= 'http://localhost:5173';
    mock.restore();
    sendEmail.mockClear();
    const { prisma } = await import('~/utils/db.server');
    const { executeFreeTierStateJump } = await import('./free-tier-jump.server');

    await prisma.setting.upsert({
      where: { name: 'feature_flag.free_tier' },
      create: {
        name: 'feature_flag.free_tier',
        value: 'true',
        valueType: 'boolean',
      },
      update: { value: 'true' },
    });

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

    const first = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: true,
      currentUserId: null,
      organizationId: org.id,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(sendEmail).not.toHaveBeenCalled();
    const app = await prisma.freeTierApplication.findFirst({
      where: {
        status: 'SENT',
        email: { endsWith: '.example.test' },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true, organizationId: true, userId: true },
    });
    expect(app?.userId).toBeTruthy();
    userIds.push(app!.userId!);
    expect(app?.status).toBe('SENT');
    expect(app?.organizationId).toBeTruthy();
    if (app) {
      appIds.push(app.id);
      if (app.organizationId) orgIds.push(app.organizationId);
    }

    mock.module('~/utils/auth.server', () => ({
      requireUserId: async () => app!.userId!,
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

    const second = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: false,
      currentUserId: app!.userId!,
      organizationId: org.id,
    });
    expect(second.ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
