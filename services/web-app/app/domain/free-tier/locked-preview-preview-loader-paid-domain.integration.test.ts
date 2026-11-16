// FREE_TIER_DB_TESTS=1 DATABASE_URL=... bun test locked-preview-preview-loader-paid-domain.integration.test.ts
import { afterAll, describe, expect, test } from 'bun:test';
import { seedFreeTierBundleAssignmentTypes } from '../../../../../packages/prisma/scripts/seed-free-tier-bundle-assignment-types';
import { prisma } from '~/utils/db.server';
import { enableFreeTierFlagForIntegrationTests } from './free-tier-integration-flag.server';
import { loader as previewLoader } from '~/routes/app.free-tier.preview/route';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const domain = `preview-paid-${Math.random().toString(36).slice(2, 8)}.edu`;

suite('locked preview loader provisions pending teachers on paid school domains', () => {
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const applicationIds: string[] = [];
  let sessionId = '';

  afterAll(async () => {
    if (!enabled) return;
    const apps = await prisma.freeTierApplication.findMany({
      where: { id: { in: applicationIds } },
      select: { organizationId: true },
    });
    orgIds.push(
      ...apps.flatMap((app) => (app.organizationId ? [app.organizationId] : []))
    );
    if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
    await prisma.freeTierApplication.deleteMany({
      where: { id: { in: applicationIds } },
    });
    await prisma.class.deleteMany({
      where: { school: { organizationId: { in: orgIds } } },
    });
    await prisma.organizationAssignmentType.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.orgMembership.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.school.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  test('MANUAL_REVIEW preview loader redirects to /app after provisioning', async () => {
    await seedFreeTierBundleAssignmentTypes(prisma);
    await enableFreeTierFlagForIntegrationTests();

    const paid = await prisma.organization.create({
      data: { name: 'Paid Campus', plan: 'SCHOOL' },
    });
    orgIds.push(paid.id);
    const paidSchool = await prisma.school.create({
      data: {
        organizationId: paid.id,
        name: 'Paid Campus',
        code: `paid-${domain.slice(0, 12)}`,
      },
    });
    const colleague = await prisma.user.create({
      data: { email: `colleague@${domain}`, name: 'Colleague' },
    });
    userIds.push(colleague.id);
    await prisma.orgMembership.create({
      data: {
        userId: colleague.id,
        organizationId: paid.id,
        role: 'TEACHER',
        schools: { connect: { id: paidSchool.id } },
      },
    });

    const teacherEmail = `teacher-manual-review@${domain}`;
    const teacher = await prisma.user.create({
      data: { email: teacherEmail, name: 'Pending Teacher' },
    });
    userIds.push(teacher.id);
    const app = await prisma.freeTierApplication.create({
      data: {
        email: teacherEmail,
        name: 'Pending Teacher',
        schoolName: 'Paid Campus',
        location: 'Local',
        gradeLevel: '11',
        starterClassName: 'English 11',
        starterClassGrade: '11',
        status: 'MANUAL_REVIEW',
        userId: teacher.id,
      },
    });
    applicationIds.push(app.id);

    const session = await prisma.session.create({
      data: { userId: teacher.id, expirationDate: new Date(Date.now() + 3_600_000) },
    });
    sessionId = session.id;
    const authCookie = await authSessionStorage.getSession();
    authCookie.set('sessionId', session.id);
    const cookieHeader = (await authSessionStorage.commitSession(authCookie)).split(
      ';'
    )[0];

    try {
      await previewLoader({
        request: new Request('https://yawp.test/app/free-tier/preview', {
          headers: { cookie: cookieHeader },
        }),
      } as never);
      throw new Error('expected redirect to /app');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).headers.get('location')).toBe('/app');
    }

    const updated = await prisma.freeTierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(updated.organizationId).toBeTruthy();
    expect(
      await prisma.orgMembership.count({
        where: {
          userId: teacher.id,
          organization: { plan: 'FREE_CLASSROOM' },
        },
      })
    ).toBe(1);
    expect(
      await prisma.orgMembership.count({
        where: { userId: teacher.id, organizationId: paid.id },
      })
    ).toBe(0);
  });
});