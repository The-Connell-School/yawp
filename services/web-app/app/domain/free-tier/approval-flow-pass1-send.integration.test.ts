// FREE_TIER_DB_TESTS=1 DATABASE_URL=... bun test approval-flow-pass1-send.integration.test.ts
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { adminApprovalEmailPreheader } from './admin-approval-copy';

const sendEmailMock = mock(async () => ({
  status: 'success' as const,
  data: { id: 'pass1-send-integration' },
}));
mock.module('~/utils/email.server', () => ({ sendEmail: sendEmailMock }));

const enabled = process.env.FREE_TIER_DB_TESTS === '1';

describe.skipIf(!enabled)('legacy approval flow threads org pass1 into delivered mail', () => {
  let prisma: typeof import('~/utils/db.server').prisma;
  let submitAdminDetails: typeof import('./approval-flow.server').submitAdminDetails;
  let resendFreeTierAdminApprovalReminder: typeof import('./approval-flow.server').resendFreeTierAdminApprovalReminder;
  let redirectSchoolAdmin: typeof import('./approval-flow.server').redirectSchoolAdmin;
  let isApprovalV2Enabled: typeof import('./approval-v2.server').isApprovalV2Enabled;

  const freeOrgId = `pass1-free-${crypto.randomUUID()}`;
  const paidOrgId = `pass1-paid-${crypto.randomUUID()}`;
  const teacherName = 'Jordan Rivera';
  const schoolName = 'Lincoln High School';
  const pass1FirstPreheader = adminApprovalEmailPreheader({
    teacherName,
    schoolName,
    pass1: true,
  });

  const appIds: string[] = [];
  const userIds: string[] = [];
  const orgIds = [freeOrgId, paidOrgId];

  beforeEach(async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'pass1-send-integration-secret-key';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({
      status: 'success' as const,
      data: { id: 'pass1-send-integration' },
    });
    prisma = (await import('~/utils/db.server')).prisma;
    ({
      submitAdminDetails,
      resendFreeTierAdminApprovalReminder,
      redirectSchoolAdmin,
    } = await import('./approval-flow.server'));
    ({ isApprovalV2Enabled } = await import('./approval-v2.server'));

    await prisma.setting.upsert({
      where: { name: 'feature_flag.free_tier' },
      create: {
        name: 'feature_flag.free_tier',
        value: JSON.stringify({ mode: 'targeted', orgIds: [freeOrgId] }),
      },
      update: {
        value: JSON.stringify({ mode: 'targeted', orgIds: [freeOrgId] }),
      },
    });
    await prisma.organization.upsert({
      where: { id: freeOrgId },
      create: { id: freeOrgId, name: 'Pass1 free org', plan: 'FREE_CLASSROOM' },
      update: { plan: 'FREE_CLASSROOM' },
    });
    await prisma.organization.upsert({
      where: { id: paidOrgId },
      create: {
        id: paidOrgId,
        name: 'Pass1 paid org',
        plan: 'SCHOOL',
        numOfStudentSeats: 100,
        numOfTeacherSeats: 10,
      },
      update: { plan: 'SCHOOL' },
    });
  });

  afterEach(async () => {
    if (!prisma) return;
    if (appIds.length) {
      await prisma.freeTierSignedLink.deleteMany({
        where: { applicationId: { in: appIds } },
      });
      await prisma.freeTierEmailLog.deleteMany({
        where: { applicationId: { in: appIds } },
      });
      await prisma.freeTierAdminApproval.deleteMany({
        where: { applicationId: { in: appIds } },
      });
      await prisma.freeTierApplication.deleteMany({ where: { id: { in: appIds } } });
      appIds.length = 0;
    }
    if (userIds.length) {
      await prisma.orgMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.password.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  async function legacyPass1Fixture() {
    const email = `pass1-legacy-${Date.now()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: teacherName,
        memberships: {
          create: [
            { organizationId: freeOrgId, role: 'TEACHER' },
            { organizationId: paidOrgId, role: 'TEACHER' },
          ],
        },
      },
    });
    userIds.push(user.id);
    const app = await prisma.freeTierApplication.create({
      data: {
        userId: user.id,
        email,
        name: teacherName,
        schoolName,
        location: 'Local',
        gradeLevel: '10',
        status: 'ACCOUNT_CREATED',
        organizationId: freeOrgId,
        starterClassName: 'English 10',
        starterClassGrade: '10',
      },
    });
    appIds.push(app.id);
    expect(await isApprovalV2Enabled(app)).toBe(false);
    return { app, user, email };
  }

  function lastDeliveryTo(to: string) {
    const deliveries = sendEmailMock.mock.calls
      .map((call) => call[0] as { to: string; text: string; html: string })
      .filter((d) => d.to === to);
    expect(deliveries.length).toBeGreaterThan(0);
    return deliveries.at(-1)!;
  }

  test('onboarding submitAdminDetails sends pass1 first-admin preheader in HTML', async () => {
    const { app, user } = await legacyPass1Fixture();
    const adminEmail = `admin-${Date.now()}@example.test`;
    expect(
      (
        await submitAdminDetails({
          applicationId: app.id,
          userId: user.id,
          adminName: 'Dr. Patel',
          adminEmail,
          adminRole: 'Principal',
        })
      ).ok
    ).toBe(true);
    const delivery = lastDeliveryTo(adminEmail);
    expect(delivery.html).toContain(pass1FirstPreheader);
    expect(delivery.html).toContain('needs your OK');
  });

  test('legacy resendFreeTierAdminApprovalReminder sends pass1 reminder copy', async () => {
    const { app, user } = await legacyPass1Fixture();
    const adminEmail = `admin-resend-${Date.now()}@example.test`;
    expect(
      (
        await submitAdminDetails({
          applicationId: app.id,
          userId: user.id,
          adminName: 'Dr. Patel',
          adminEmail,
          adminRole: 'Principal',
        })
      ).ok
    ).toBe(true);
    sendEmailMock.mockClear();
    const request = new Request('https://yawp.test/resend');
    expect(
      (await resendFreeTierAdminApprovalReminder({ applicationId: app.id, request })).ok
    ).toBe(true);
    const delivery = lastDeliveryTo(adminEmail);
    expect(delivery.text).toContain(
      'A quick reminder: Jordan Rivera at Lincoln High School is still waiting on your approval.'
    );
    expect(delivery.html).toContain("Jordan Rivera's request for Lincoln High School is still open");
  });

  test('legacy redirectSchoolAdmin sends pass1 forward banner copy', async () => {
    const { app, user } = await legacyPass1Fixture();
    const adminEmail = `admin-forward-${Date.now()}@example.test`;
    expect(
      (
        await submitAdminDetails({
          applicationId: app.id,
          userId: user.id,
          adminName: 'Dr. Patel',
          adminEmail,
          adminRole: 'Principal',
        })
      ).ok
    ).toBe(true);
    const first = lastDeliveryTo(adminEmail);
    const declineUrl = first.text
      .split('\n')
      .find((line) => line.includes('/free/admin/not-right-person?t='))!;
    const replacementEmail = `replacement-${Date.now()}@example.test`;
    sendEmailMock.mockClear();
    expect(
      (
        await redirectSchoolAdmin({
          token: new URL(declineUrl).searchParams.get('t')!,
          newAdminName: 'Principal Lee',
          newAdminEmail: replacementEmail,
          request: new Request('https://yawp.test/forward'),
        })
      ).ok
    ).toBe(true);
    const delivery = lastDeliveryTo(replacementEmail);
    expect(delivery.text).toContain(
      "Dr. Patel forwarded Jordan Rivera's request at Lincoln High School to you."
    );
    expect(delivery.html).toContain(
      "Dr. Patel forwarded Jordan Rivera's request at Lincoln High School to you."
    );
  });
});
