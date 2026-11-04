import { afterAll, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

import { findTeacherClassIdentityConflict } from './class-identity.server';

function buildClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, ssl: false }),
  });
}

describe.skipIf(!process.env.DATABASE_URL)(
  'class identity conflicts (real db)',
  () => {
    const prisma = buildClient();
    const createdOrgIds: string[] = [];

    afterAll(async () => {
      try {
        if (createdOrgIds.length) {
          await prisma.class.deleteMany({
            where: { school: { organizationId: { in: createdOrgIds } } },
          });
          await prisma.orgMembership.deleteMany({
            where: { organizationId: { in: createdOrgIds } },
          });
          await prisma.school.deleteMany({
            where: { organizationId: { in: createdOrgIds } },
          });
          await prisma.organization.deleteMany({
            where: { id: { in: createdOrgIds } },
          });
        }
      } finally {
        await prisma.$disconnect();
      }
    });

    test('allows the same section identity in a new school year', async () => {
      const org = await prisma.organization.create({
        data: {
          name: `Class identity ${Date.now()}`,
          plan: 'SCHOOL',
          numOfStudentSeats: 100,
          numOfTeacherSeats: 10,
        },
        select: { id: true },
      });
      createdOrgIds.push(org.id);
      const school = await prisma.school.create({
        data: {
          organizationId: org.id,
          name: 'Identity School',
          code: `id-${Date.now()}`.slice(0, 20),
        },
        select: { id: true },
      });
      const teacher = await prisma.orgMembership.create({
        data: {
          organizationId: org.id,
          role: 'TEACHER',
          user: {
            create: {
              email: `identity-${Date.now()}@yawp.test`,
              name: 'Identity Teacher',
            },
          },
          schools: { connect: { id: school.id } },
        },
        select: { id: true },
      });

      const priorYearClass = await prisma.class.create({
        data: {
          schoolId: school.id,
          schoolYear: '2025-2026',
          grade: '11',
          period: '3',
          title: 'Theology III',
          code: `PY${Date.now()}`.slice(0, 12),
          teachers: { connect: { id: teacher.id } },
        },
        select: { id: true },
      });

      const conflict = await findTeacherClassIdentityConflict(prisma, {
        schoolId: school.id,
        schoolYear: '2026-2027',
        grade: '11',
        period: '3',
        title: 'Theology III',
        teacherMembershipIds: [teacher.id],
      });

      expect(conflict).toBeNull();

      const sameYearConflict = await findTeacherClassIdentityConflict(prisma, {
        schoolId: school.id,
        schoolYear: '2025-2026',
        grade: '11',
        period: '3',
        title: 'Theology III',
        teacherMembershipIds: [teacher.id],
      });

      expect(sameYearConflict?.id).toBe(priorYearClass.id);
    });
  }
);
