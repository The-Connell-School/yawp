import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const enabled = process.env.FREE_TIER_JUMP_DB_TESTS === '1';

mock.module('~/utils/email.server', () => ({
  sendEmail: async () => ({ status: 'success' as const }),
  getTransactionalEmailFrom: () => 'transactional-from@example.org',
}));

const userIds: string[] = [];
const appIds: string[] = [];
const provisionedOrgIds: string[] = [];

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
    return org.id;
}

const APPROVED_STATE_IDS = [
  'approved.first-time-toast',
  'approved.usage-plenty-left',
  'approved.usage-about-half-left',
  'approved.usage-a-few-left',
  'approved.usage-all-used',
  'approved.lesson-planner-limit',
  'approved.reporter-limit',
] as const;

describe.skipIf(!enabled)('executeFreeTierStateJump approved states (real db)', () => {
  beforeEach(() => {
    process.env.FREE_TIER_LINK_HMAC_SECRET ??=
      'local-dev-panel-jump-test-signing-secret';
    process.env.PRIMARY_APP_URL ??= 'http://localhost:5173';
  });

  afterAll(async () => {
    const prisma = await loadPrisma();
    if (provisionedOrgIds.length) {
      await prisma.setting.deleteMany({
        where: {
          OR: provisionedOrgIds.flatMap((organizationId) => [
            {
              name: {
                startsWith: `free_tier.monthly.v1:${organizationId}:lesson-planner:`,
              },
            },
            {
              name: {
                startsWith: `free_tier.monthly.v1:${organizationId}:reporter:`,
              },
            },
          ]),
        },
      });
    }
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
    if (provisionedOrgIds.length) {
      await prisma.class.deleteMany({
        where: { school: { organizationId: { in: provisionedOrgIds } } },
      });
      await prisma.school.deleteMany({
        where: { organizationId: { in: provisionedOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: provisionedOrgIds } },
      });
    }
  });

  for (const stateId of APPROVED_STATE_IDS) {
    test(`${stateId} throwaway jump succeeds and is idempotent`, async () => {
      const prisma = await loadPrisma();
      const { executeFreeTierStateJump } = await loadJump();
      await enableFreeTierFlag(prisma);
      const organizationId = await defaultOrg(prisma);

      const input = {
        request: new Request('http://localhost/'),
        stateId,
        throwaway: true,
        currentUserId: null,
        organizationId,
      };

      const first = await executeFreeTierStateJump(input);
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const user = await prisma.user.findFirst({
        where: { email: first.throwawayEmail },
        select: { id: true },
      });
      expect(user?.id).toBeTruthy();
      userIds.push(user!.id);

      const app = await prisma.freeTierApplication.findFirst({
        where: { userId: user!.id },
        select: { id: true, status: true, organizationId: true },
      });
      expect(app?.status).toBe('APPROVED');
      expect(app?.organizationId).toBeTruthy();
      if (app) {
        appIds.push(app.id);
        if (app.organizationId) provisionedOrgIds.push(app.organizationId);
      }

      const second = await executeFreeTierStateJump({
        ...input,
        throwaway: false,
        currentUserId: user!.id,
      });
      expect(second.ok).toBe(true);
    });
  }

  test('admin-side approve jump succeeds twice', async () => {
    const prisma = await loadPrisma();
    const { executeFreeTierStateJump } = await loadJump();
    await enableFreeTierFlag(prisma);
    const organizationId = await defaultOrg(prisma);
    const input = {
      request: new Request('http://localhost/'),
      stateId: 'admin.approve-from-email',
      throwaway: true,
      currentUserId: null,
      organizationId,
    };
    const first = await executeFreeTierStateJump(input);
    expect(first.ok).toBe(true);
    if (first.ok && first.throwawayEmail) {
      const user = await prisma.user.findFirst({
        where: { email: first.throwawayEmail },
        select: { id: true },
      });
      if (user) userIds.push(user.id);
      const app = await prisma.freeTierApplication.findFirst({
        where: { email: first.throwawayEmail },
        select: { id: true },
      });
      if (app) appIds.push(app.id);
    }
    const second = await executeFreeTierStateJump(input);
    expect(second.ok).toBe(true);
  });
});
