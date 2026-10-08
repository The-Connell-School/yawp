import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  assertCanCreateAssignmentOfKindInTransaction,
  getLifetimeAssignmentKindCount,
} from './assignment-quota.server';

/** Owned by #414; #416 depends on it but does not ship the migration. */
const FREE_TIER_USAGE_MIGRATION_PRESENT = existsSync(
  join(
    import.meta.dir,
    '..',
    '..',
    '..',
    'packages',
    'prisma',
    'migrations',
    '20261007235900_free_classroom_assignment_kind_usage',
    'migration.sql'
  )
);
import { createAssignmentDeployedToClasses } from './assignment-deployment.server';
import { provisionFreeClassroom } from '~/domain/free-tier/provision-free-classroom.server';

const DB = process.env.FREE_TIER_DB_TESTS_URL ?? process.env.DATABASE_URL;

function client() {
  if (!DB) throw new Error('FREE_TIER_DB_TESTS_URL or DATABASE_URL required');
  const adapter = new PrismaPg({ connectionString: DB, ssl: false });
  return new PrismaClient({ adapter });
}

describe.skipIf(!process.env.DATABASE_URL || !FREE_TIER_USAGE_MIGRATION_PRESENT)(
  'free classroom assignment quotas (db)',
  () => {
  const prisma = client();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('delete + recreate is refused when lifetime quota is exhausted', async () => {
    const email = `quota-db-${Date.now()}@gmail.com`;
    const user = await prisma.user.create({
      data: { email, name: 'Quota DB Teacher' },
      select: { id: true },
    });
    const application = await prisma.freeTierApplication.create({
      data: {
        email,
        name: 'Quota DB Teacher',
        schoolName: 'Quota DB School',
        location: 'Test',
        gradeLevel: '9-12',
        status: 'APPROVED',
        userId: user.id,
      },
      select: { id: true },
    });

    const provisioned = await provisionFreeClassroom(application.id);
    expect(provisioned.status).toBe('provisioned');
    if (provisioned.status !== 'provisioned') {
      throw new Error('expected provisioned org');
    }
    const organizationId = provisioned.organizationId;

    const classStarter = await prisma.assignmentType.findFirst({
      where: { kind: 'class_starter' },
      select: { id: true },
    });
    expect(classStarter).toBeTruthy();

    const klass = await prisma.class.findFirst({
      where: { school: { organizationId } },
      select: { id: true },
    });
    expect(klass).toBeTruthy();

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < 12; index += 1) {
        await assertCanCreateAssignmentOfKindInTransaction(
          tx,
          { id: organizationId, plan: 'FREE_CLASSROOM' },
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
      organizationId,
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
