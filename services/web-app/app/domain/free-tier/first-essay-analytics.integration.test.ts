import { afterAll, describe, expect, test } from 'bun:test';
import { basePrisma as prisma } from '~/utils/db.server';
import {
  isFirstFreeTierEssayInTx,
  lockFreeTierFirstEssay,
} from './first-essay-analytics.server';
const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const marker = `posthog-first-essay-${Date.now()}`;
const orgIds: string[] = [];
const userIds: string[] = [];
const assignmentIds: string[] = [];
afterAll(async () => {
  if (!enabled) return;
  await prisma.setting.deleteMany({ where: { name: marker } });
  await prisma.submission.deleteMany({
    where: {
      document: {
        OR: [
          { membership: { organizationId: { in: orgIds } } },
          { classAssignment: { assignmentId: { in: assignmentIds } } },
        ],
      },
    },
  });
  await prisma.documentGroup.deleteMany({
    where: { classAssignment: { assignmentId: { in: assignmentIds } } },
  });
  await prisma.document.deleteMany({
    where: {
      OR: [
        { membership: { organizationId: { in: orgIds } } },
        { classAssignment: { assignmentId: { in: assignmentIds } } },
      ],
    },
  });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.orgMembership.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.class.deleteMany({
    where: { school: { organizationId: { in: orgIds } } },
  });
  await prisma.school.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});
suite('first essay PostgreSQL decisions', () => {
  test('concurrent solo and ownerless group submissions share one first-essay decision', async () => {
    const org = await prisma.organization.create({
      data: { name: marker, plan: 'FREE_CLASSROOM' },
    });
    orgIds.push(org.id);
    const school = await prisma.school.create({
      data: { name: marker, code: marker, organizationId: org.id },
    });
    const klass = await prisma.class.create({
      data: { code: marker, schoolId: school.id },
    });
    const user = await prisma.user.create({
      data: { name: marker, email: `${marker}@yawp.local` },
    });
    userIds.push(user.id);
    const member = await prisma.orgMembership.create({
      data: { organizationId: org.id, userId: user.id, role: 'STUDENT' },
    });
    const kind = await prisma.assignmentType.findFirstOrThrow();
    const assignment = await prisma.assignment.create({
      data: { assignmentTypeId: kind.id, prompt: 'Local fixture' },
    });
    assignmentIds.push(assignment.id);
    const deployed = await prisma.classAssignment.create({
      data: { assignmentId: assignment.id, classId: klass.id },
    });
    const solo = await prisma.document.create({
      data: { membershipId: member.id, assignmentTypeId: kind.id },
    });
    const group = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          artifactKind: 'ASSIGNMENT_GROUP',
          assignmentId: assignment.id,
          classAssignmentId: deployed.id,
          assignmentTypeId: kind.id,
        },
      });
      await tx.documentGroup.create({
        data: {
          classAssignmentId: deployed.id,
          label: 'Local group',
          ordinal: 1,
          openedAt: new Date(),
          documentId: doc.id,
        },
      });
      return doc;
    });
    const results = await Promise.all(
      [solo, group].map((doc) =>
        prisma.$transaction(async (tx) => {
          await lockFreeTierFirstEssay(tx, org.id);
          await tx.submission.create({
            data: {
              documentId: doc.id,
              title: 'Local fixture',
              text: 'Local text',
              html: '<p>Local text</p>',
              submittedAt: new Date(),
            },
          });
          return isFirstFreeTierEssayInTx(tx, org.id);
        })
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.$transaction((tx) => isFirstFreeTierEssayInTx(tx, org.id))
    ).toBe(false);
  });
  test('an actual SQL error in the optional count rolls back only the savepoint', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.setting.create({
        data: { name: marker, value: 'before', valueType: 'string' },
      });
      const failingCount = new Proxy(tx, {
        get(target, key) {
          if (key === 'submission')
            return { count: () => target.$queryRaw`SELECT 1 / 0` };
          return Reflect.get(target, key);
        },
      });
      expect(await isFirstFreeTierEssayInTx(failingCount, 'unused')).toBe(
        false
      );
      expect(
        (await tx.setting.findUniqueOrThrow({ where: { name: marker } })).value
      ).toBe('before');
      await tx.setting.update({
        where: { name: marker },
        data: { value: 'accepted' },
      });
    });
    expect(
      (await prisma.setting.findUniqueOrThrow({ where: { name: marker } }))
        .value
    ).toBe('accepted');
  });
});
