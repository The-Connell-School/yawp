import { describe, expect, test } from 'bun:test';
import { PrismaClient } from '@app/prisma';
import { planGrantUaStudentLicense } from './grant-ua-student-license';

// Optional integration test against a real Postgres schema.
// Skips unless UA_LICENSE_TEST_DATABASE_URL is set.

const url = process.env.UA_LICENSE_TEST_DATABASE_URL;

describe.skipIf(!url)('grant-ua-student-license integration (dry-run)', () => {
  test('plans a grant on a seeded schema', async () => {
    const prisma = new PrismaClient({ datasourceUrl: url });
    const suffix = Math.random().toString(16).slice(2, 8);
    const email = `ua-test-${suffix}@example.test`;
    try {
      const org = await prisma.organization.create({
        data: { name: `UA Test Org ${suffix}` },
        select: { id: true },
      });
      const user = await prisma.user.create({
        data: { email },
        select: { id: true },
      });
      await prisma.orgMembership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'STUDENT',
          isActive: true,
        },
      });

      const result = await planGrantUaStudentLicense(prisma, {
        email,
        organizationId: org.id,
      });
      expect(result.kind).toBe('plan');
    } finally {
      // best-effort cleanup
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "OrgMembership" WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
          email
        );
        await prisma.user.deleteMany({ where: { email } });
        await prisma.organization.deleteMany({ where: { name: { contains: `UA Test Org ${suffix}` } } });
      } catch {}
      await prisma.$disconnect();
    }
  });
});

