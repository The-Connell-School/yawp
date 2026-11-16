// Real-SQL coverage for staff approval when the teacher domain matches a paid school.
import { afterAll, describe, expect, test } from 'bun:test';
import { seedFreeTierBundleAssignmentTypes } from '../../../../../packages/prisma/scripts/seed-free-tier-bundle-assignment-types';
import { prisma } from '~/utils/db.server';
import {
  provisionFreeClassroom,
  provisionFreeClassroomFromApproval,
} from './provision-free-classroom.server';
import { repairUnprovisionedFreeClassrooms } from './repair-unprovisioned-free-classrooms.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const domain = `paid-${Math.random().toString(36).slice(2, 8)}.edu`;

suite('staff approval provisions a free classroom beside a paid school domain', () => {
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const applicationIds: string[] = [];

  afterAll(async () => {
    if (!enabled) return;
    const apps = await prisma.freeTierApplication.findMany({
      where: { id: { in: applicationIds } },
      select: { organizationId: true },
    });
    orgIds.push(
      ...apps.flatMap((app) => (app.organizationId ? [app.organizationId] : []))
    );
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
      where: { organizationId: { in: orgIds } },
    });
    await prisma.school.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  test('provisions the onboarding class, records the paid school, and does not join it', async () => {
    await seedFreeTierBundleAssignmentTypes(prisma);
    const paid = await prisma.organization.create({
      data: { name: 'Lincoln High', plan: 'SCHOOL' },
    });
    orgIds.push(paid.id);
    const paidSchool = await prisma.school.create({
      data: {
        organizationId: paid.id,
        name: 'Lincoln High',
        code: `lincoln-${domain.slice(0, 12)}`,
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

    const teacherEmail = `teacher@${domain}`;
    const teacher = await prisma.user.create({
      data: { email: teacherEmail, name: 'New Teacher' },
    });
    userIds.push(teacher.id);
    const app = await prisma.freeTierApplication.create({
      data: {
        email: teacherEmail,
        name: 'New Teacher',
        schoolName: 'Lincoln High',
        location: 'Local',
        gradeLevel: '11',
        starterClassName: 'English 11',
        starterClassGrade: '11',
        status: 'APPROVED',
        userId: teacher.id,
      },
    });
    applicationIds.push(app.id);

    expect((await provisionFreeClassroom(app.id)).status).toBe(
      'routed_to_school_onboarding'
    );
    expect(
      (await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } }))
        .organizationId
    ).toBeNull();

    const dryRun = await repairUnprovisionedFreeClassrooms({
      apply: false,
      applicationIds: [app.id],
    });
    expect(dryRun.rows.find((row) => row.applicationId === app.id)).toMatchObject({
      reason: 'no_organization',
      email: teacherEmail,
    });
    expect(
      await prisma.orgMembership.count({
        where: { userId: teacher.id, organizationId: paid.id },
      })
    ).toBe(0);

    const first = await provisionFreeClassroomFromApproval(app.id);
    expect(first.status).toBe('provisioned');
    const updated = await prisma.freeTierApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    expect(updated.organizationId).toBeTruthy();
    expect(updated.organizationId).not.toBe(paid.id);
    expect(updated.notes).toBe(
      "Teacher's domain matches paid school Lincoln High."
    );
    const freeOrg = await prisma.organization.findUniqueOrThrow({
      where: { id: updated.organizationId! },
    });
    expect(freeOrg.plan).toBe('FREE_CLASSROOM');
    const membership = await prisma.orgMembership.findFirstOrThrow({
      where: { userId: teacher.id, organizationId: freeOrg.id, role: 'TEACHER' },
    });
    const classes = await prisma.class.findMany({
      where: { teachers: { some: { id: membership.id } }, isArchived: false },
    });
    expect(classes).toEqual([
      expect.objectContaining({ title: 'English 11', grade: '11' }),
    ]);
    expect(
      await prisma.orgMembership.count({
        where: { userId: teacher.id, organizationId: paid.id },
      })
    ).toBe(0);

    const again = await provisionFreeClassroomFromApproval(app.id);
    expect(again).toEqual({
      status: 'already_provisioned',
      organizationId: freeOrg.id,
    });
    expect(
      await prisma.class.count({
        where: { teachers: { some: { userId: teacher.id } }, isArchived: false },
      })
    ).toBe(1);
    expect(
      (
        await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } })
      ).notes
    ).toBe("Teacher's domain matches paid school Lincoln High.");
    expect(
      await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } })
    ).toBe(0);

    const after = await repairUnprovisionedFreeClassrooms({
      apply: true,
      applicationIds: [app.id],
    });
    expect(after.rows.find((row) => row.applicationId === app.id)).toBeUndefined();
    expect(
      await prisma.class.count({
        where: { teachers: { some: { userId: teacher.id } }, isArchived: false },
      })
    ).toBe(1);
  });
});
