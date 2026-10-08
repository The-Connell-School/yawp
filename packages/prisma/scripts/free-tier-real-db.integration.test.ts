import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedFreeTierBundleAssignmentTypes } from './seed-free-tier-bundle-assignment-types';
import { provisionFreeClassroom } from '../../../services/web-app/app/domain/free-tier/provision-free-classroom.server';
import { assertCanCreateClassInTransaction } from '../../../services/web-app/app/utils/assignment-quota.server';
import {
  assertCanCreateAssignmentOfKindInTransaction,
  getLifetimeAssignmentKindCount,
} from '../../../services/web-app/app/utils/assignment-quota.server';
import { createAssignmentDeployedToClasses } from '../../../services/web-app/app/utils/assignment-deployment.server';

const DB = process.env.DATABASE_URL;

/** Owned by #414; #416 depends on it but does not ship the migration. */
const FREE_TIER_USAGE_MIGRATION_PRESENT = existsSync(
  join(
    import.meta.dir,
    '..',
    'migrations',
    '20261007235900_free_classroom_assignment_kind_usage',
    'migration.sql'
  )
);

function buildClient() {
  if (!DB) throw new Error('DATABASE_URL is required');
  const adapter = new PrismaPg({ connectionString: DB, ssl: false });
  return new PrismaClient({ adapter });
}

describe.skipIf(!FREE_TIER_USAGE_MIGRATION_PRESENT)(
  'free tier real Postgres integration',
  () => {
  const prisma = buildClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('provisions idempotently for the same application', async () => {
    await seedFreeTierBundleAssignmentTypes(prisma);
    const email = `provision-idempotent-${Date.now()}@gmail.com`;
    const user = await prisma.user.create({
      data: { email, name: 'Provision Idempotent' },
      select: { id: true },
    });
    const application = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Provision Idempotent',
        schoolName: 'Idempotent School',
        location: 'Test',
        gradeLevel: '9-12',
        status: 'APPROVED',
        userId: user.id,
      },
      select: { id: true },
    });

    const first = await provisionFreeClassroom(application.id);
    expect(first.status).toBe('provisioned');
    const second = await provisionFreeClassroom(application.id);
    expect(second.status).toBe('already_provisioned');
    if (first.status === 'provisioned' && second.status === 'already_provisioned') {
      expect(second.organizationId).toBe(first.organizationId);
    }

    const orgCount = await prisma.organization.count({
      where: { plan: 'FREE_CLASSROOM', name: 'Idempotent School' },
    });
    expect(orgCount).toBe(1);
  });

  test('concurrent provisioning for one application yields a single org', async () => {
    await seedFreeTierBundleAssignmentTypes(prisma);
    const email = `provision-race-${Date.now()}@gmail.com`;
    const user = await prisma.user.create({
      data: { email, name: 'Provision Race' },
      select: { id: true },
    });
    const application = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Provision Race',
        schoolName: 'Race School',
        location: 'Test',
        gradeLevel: '9-12',
        status: 'APPROVED',
        userId: user.id,
      },
      select: { id: true },
    });

    const results = await Promise.all([
      provisionFreeClassroom(application.id),
      provisionFreeClassroom(application.id),
      provisionFreeClassroom(application.id),
    ]);
    const provisioned = results.filter((row) => row.status === 'provisioned');
    const already = results.filter((row) => row.status === 'already_provisioned');
    expect(provisioned.length).toBe(1);
    expect(provisioned.length + already.length).toBe(3);

    const orgCount = await prisma.organization.count({
      where: { plan: 'FREE_CLASSROOM', name: 'Race School' },
    });
    expect(orgCount).toBe(1);
  });

  test('one active class cap is race-safe under concurrent creates', async () => {
    await seedFreeTierBundleAssignmentTypes(prisma);
    const org = await prisma.organization.create({
      data: {
        name: `One Class Race ${Date.now()}`,
        plan: 'FREE_CLASSROOM',
        numOfStudentSeats: 35,
        numOfTeacherSeats: 1,
      },
      select: { id: true, plan: true },
    });
    const school = await prisma.school.create({
      data: {
        organizationId: org.id,
        name: 'Race School',
        code: `race-${Date.now()}`.slice(0, 20),
      },
      select: { id: true },
    });
    const teacher = await prisma.user.create({
      data: {
        email: `race-teacher-${Date.now()}@yawp.test`,
        name: 'Race Teacher',
      },
      select: { id: true },
    });
    const membership = await prisma.orgMembership.create({
      data: {
        organization: { connect: { id: org.id } },
        role: 'TEACHER',
        user: { connect: { id: teacher.id } },
        schools: { connect: { id: school.id } },
      },
      select: { id: true },
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        prisma.$transaction(async (tx) => {
          await assertCanCreateClassInTransaction(tx, org);
          return tx.class.create({
            data: {
              schoolId: school.id,
              schoolYear: '2026-2027',
              code: `RACE-${index}-${Date.now()}`.slice(0, 12),
              teachers: { connect: { id: membership.id } },
            },
            select: { id: true },
          });
        })
      )
    );

    const fulfilled = attempts.filter((row) => row.status === 'fulfilled');
    const rejected = attempts.filter((row) => row.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(3);

    const activeClasses = await prisma.class.count({
      where: { isArchived: false, school: { organizationId: org.id } },
    });
    expect(activeClasses).toBe(1);
  });

  test('lifetime assignment quota refuses delete then recreate', async () => {
    await seedFreeTierBundleAssignmentTypes(prisma);
    const email = `quota-lifetime-${Date.now()}@gmail.com`;
    const user = await prisma.user.create({
      data: { email, name: 'Quota Lifetime' },
      select: { id: true },
    });
    const application = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Quota Lifetime',
        schoolName: 'Quota School',
        location: 'Test',
        gradeLevel: '9-12',
        status: 'APPROVED',
        userId: user.id,
      },
      select: { id: true },
    });
    const provisioned = await provisionFreeClassroom(application.id);
    expect(provisioned.status).toBe('provisioned');
    if (provisioned.status !== 'provisioned') return;

    const classStarter = await prisma.assignmentType.findFirst({
      where: { kind: 'class_starter' },
      select: { id: true },
    });
    const klass = await prisma.class.findFirst({
      where: { school: { organizationId: provisioned.organizationId } },
      select: { id: true },
    });
    expect(classStarter && klass).toBeTruthy();

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < 12; index += 1) {
        await assertCanCreateAssignmentOfKindInTransaction(
          tx,
          { id: provisioned.organizationId, plan: 'FREE_CLASSROOM' },
          'class_starter'
        );
        await tx.assignment.create({
          data: {
            assignmentTypeId: classStarter!.id,
            title: `Starter ${index}`,
            prompt: 'p',
            classAssignments: { create: { classId: klass!.id } },
          },
        });
      }
    });

    const count = await getLifetimeAssignmentKindCount(
      provisioned.organizationId,
      'class_starter',
      prisma
    );
    expect(count).toBe(12);

    const assignment = await prisma.assignment.findFirst({
      where: {
        assignmentTypeId: classStarter!.id,
        classAssignments: { some: { classId: klass!.id } },
      },
      select: { id: true },
    });
    await prisma.classAssignment.deleteMany({
      where: { assignmentId: assignment!.id },
    });
    await prisma.assignment.delete({ where: { id: assignment!.id } });

    await expect(
      createAssignmentDeployedToClasses({
        data: {
          assignmentTypeId: classStarter!.id,
          title: 'Should fail',
          prompt: 'p',
        },
        classIds: [klass!.id],
      })
    ).rejects.toThrow(/used all 12/i);
  });
  }
);
