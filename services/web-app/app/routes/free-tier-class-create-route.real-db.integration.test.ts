import { afterAll, describe, expect, mock, test } from 'bun:test';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedFreeTierBundleAssignmentTypes } from '../../../../packages/prisma/scripts/seed-free-tier-bundle-assignment-types';

const DB = process.env.DATABASE_URL;

function buildClient() {
  if (!DB) throw new Error('DATABASE_URL is required');
  const adapter = new PrismaPg({ connectionString: DB, ssl: false });
  return new PrismaClient({ adapter });
}

type TestProfile = {
  id: string;
  role: 'TEACHER';
  isOrgOwner: boolean;
  organization: { id: string; plan: 'SCHOOL' | 'FREE_CLASSROOM' };
};

let currentUserId = '';
let currentProfile: TestProfile | null = null;

mock.module('~/utils/auth.server.js', () => ({
  requireUserId: async () => currentUserId,
  requireMembership: async () => currentProfile,
  requireOwner: async () => currentProfile,
}));

const { action: myClassesAction } = await import(
  './app.my-classes._index/route'
);
const { action: orgClassesAction } = await import(
  './app.organization.classes/route'
);

describe.skipIf(!process.env.DATABASE_URL)(
  'free tier class create routes (real db)',
  () => {
    const prisma = buildClient();
    const createdOrgIds: string[] = [];

    afterAll(async () => {
      if (createdOrgIds.length) {
        await prisma.organization.deleteMany({
          where: { id: { in: createdOrgIds } },
        });
      }
      await prisma.$disconnect();
    });

    async function createTeacherFixture(plan: 'SCHOOL' | 'FREE_CLASSROOM') {
      const org = await prisma.organization.create({
        data: {
          name: `Route Class Cap ${plan} ${Date.now()}`,
          plan,
          numOfStudentSeats: plan === 'FREE_CLASSROOM' ? 35 : 100,
          numOfTeacherSeats: plan === 'FREE_CLASSROOM' ? 1 : 10,
        },
        select: { id: true, plan: true },
      });
      createdOrgIds.push(org.id);
      const school = await prisma.school.create({
        data: {
          organizationId: org.id,
          name: 'Test School',
          code: `t-${Date.now()}`.slice(0, 20),
        },
        select: { id: true },
      });
      const user = await prisma.user.create({
        data: {
          email: `route-cap-${plan}-${Date.now()}@yawp.test`,
          name: 'Route Cap Teacher',
        },
        select: { id: true },
      });
      const membership = await prisma.orgMembership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'TEACHER',
          isOrgOwner: true,
          schools: { connect: { id: school.id } },
        },
        select: { id: true },
      });
      await prisma.class.create({
        data: {
          schoolId: school.id,
          schoolYear: '2026-2027',
          code: `EXIST-${Date.now()}`.slice(0, 12),
          teachers: { connect: { id: membership.id } },
        },
      });
      return { org, school, user, membership };
    }

    function createClassForm(schoolId: string) {
      const body = new FormData();
      body.set('intent', 'create-class');
      body.set('schoolId', schoolId);
      body.set('schoolYear', '2026-2027');
      body.set('code', `NEW-${Date.now()}`.slice(0, 12));
      body.set('teacherIds', '');
      return body;
    }

    test('POST /app/my-classes?index returns 403 for FREE_CLASSROOM at cap', async () => {
      await seedFreeTierBundleAssignmentTypes(prisma);
      const { org, school, user, membership } =
        await createTeacherFixture('FREE_CLASSROOM');
      currentUserId = user.id;
      currentProfile = {
        id: membership.id,
        role: 'TEACHER',
        isOrgOwner: true,
        organization: org,
      };

      const before = await prisma.class.count({
        where: { isArchived: false, school: { organizationId: org.id } },
      });
      expect(before).toBe(1);

      const response = await myClassesAction({
        request: new Request('https://example.test/app/my-classes?index', {
          method: 'POST',
          body: createClassForm(school.id),
        }),
        params: {},
        context: {} as never,
      } as any);

      expect(response.init?.status ?? 200).toBe(403);
      const after = await prisma.class.count({
        where: { isArchived: false, school: { organizationId: org.id } },
      });
      expect(after).toBe(1);
    });

    test('POST /app/my-classes?index allows SCHOOL org second class', async () => {
      const { org, school, user, membership } =
        await createTeacherFixture('SCHOOL');
      currentUserId = user.id;
      currentProfile = {
        id: membership.id,
        role: 'TEACHER',
        isOrgOwner: true,
        organization: org,
      };

      const response = await myClassesAction({
        request: new Request('https://example.test/app/my-classes?index', {
          method: 'POST',
          body: createClassForm(school.id),
        }),
        params: {},
        context: {} as never,
      } as any);

      expect(response.init?.status ?? 200).toBe(200);
      const after = await prisma.class.count({
        where: { isArchived: false, school: { organizationId: org.id } },
      });
      expect(after).toBe(2);
    });

    test('POST /app/organization/classes returns 403 for FREE_CLASSROOM at cap', async () => {
      const { org, school, user, membership } =
        await createTeacherFixture('FREE_CLASSROOM');
      currentUserId = user.id;
      currentProfile = {
        id: membership.id,
        role: 'TEACHER',
        isOrgOwner: true,
        organization: org,
      };

      const body = createClassForm(school.id);
      body.set('teacherIds', membership.id);

      const response = await orgClassesAction({
        request: new Request('https://example.test/app/organization/classes', {
          method: 'POST',
          body,
        }),
        params: {},
        context: {} as never,
      } as any);

      expect(response.init?.status ?? 200).toBe(403);
      const after = await prisma.class.count({
        where: { isArchived: false, school: { organizationId: org.id } },
      });
      expect(after).toBe(1);
    });

    test('POST /app/organization/classes allows SCHOOL org second class', async () => {
      const { org, school, user, membership } =
        await createTeacherFixture('SCHOOL');
      currentUserId = user.id;
      currentProfile = {
        id: membership.id,
        role: 'TEACHER',
        isOrgOwner: true,
        organization: org,
      };

      const body = createClassForm(school.id);
      body.set('teacherIds', membership.id);

      const response = await orgClassesAction({
        request: new Request('https://example.test/app/organization/classes', {
          method: 'POST',
          body,
        }),
        params: {},
        context: {} as never,
      } as any);

      expect(response.init?.status ?? 200).toBe(200);
      const after = await prisma.class.count({
        where: { isArchived: false, school: { organizationId: org.id } },
      });
      expect(after).toBe(2);
    });
  }
);
