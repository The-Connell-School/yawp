import { afterAll, describe, expect, mock, test } from 'bun:test';
import { type OrganizationPlan, PrismaClient } from '@app/prisma';
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
  organization: { id: string; plan: OrganizationPlan };
};

let currentUserId = '';
let currentProfile: TestProfile | null = null;

mock.module('~/utils/auth.server.js', () => ({
  requireUserId: async () => currentUserId,
  requireMembership: async () => currentProfile,
  requireOwner: async () => currentProfile,
}));

const { action: myClassesAction } = await import(
  '../routes/app.my-classes._index/route'
);
const { action: orgClassesAction } = await import(
  '../routes/app.organization.classes/route'
);

function actionHttpStatus(result: unknown) {
  if (result instanceof Response) return result.status;
  const wrapped = result as { init?: ResponseInit };
  return wrapped.init?.status ?? 200;
}

describe.skipIf(!process.env.DATABASE_URL)(
  'free tier class create routes (real db)',
  () => {
    const prisma = buildClient();
    const createdOrgIds: string[] = [];
    const createdUserIds: string[] = [];

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
          if (createdUserIds.length) {
            await prisma.user.deleteMany({
              where: { id: { in: createdUserIds } },
            });
          }
          await prisma.organization.deleteMany({
            where: { id: { in: createdOrgIds } },
          });
        }
      } finally {
        await prisma.$disconnect();
      }
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
      createdUserIds.push(user.id);
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

      expect(actionHttpStatus(response)).toBe(403);
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

      expect(actionHttpStatus(response)).toBe(200);
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

      expect(actionHttpStatus(response)).toBe(403);
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

      expect(actionHttpStatus(response)).toBe(200);
      const after = await prisma.class.count({
        where: { isArchived: false, school: { organizationId: org.id } },
      });
      expect(after).toBe(2);
    });

    test('direct create/edit requests enforce code fields across organizations and preserve own-code edits', async () => {
      const a = await createTeacherFixture('SCHOOL');
      const b = await createTeacherFixture('SCHOOL');
      const takenCode = `TAKEN${Date.now()}`;
      const ownCode = `OWN${Date.now()}`;
      const taken = await prisma.class.findFirstOrThrow({ where: { schoolId: a.school.id } });
      const own = await prisma.class.findFirstOrThrow({ where: { schoolId: b.school.id } });
      await prisma.class.update({ where: { id: taken.id }, data: { code: takenCode.toLowerCase() } });
      await prisma.class.update({ where: { id: own.id }, data: { code: ownCode } });
      currentUserId = b.user.id;
      currentProfile = { id: b.membership.id, role: 'TEACHER', isOrgOwner: true, organization: b.org };
      const name = 'feature_flag.classcode-unique';
      const previous = await prisma.setting.findUnique({ where: { name } });
      try {
        await prisma.setting.upsert({ where: { name }, create: { name, value: 'true', valueType: 'boolean' }, update: { value: 'true' } });
        for (const action of [myClassesAction, orgClassesAction]) {
          for (const intent of ['create-class', 'edit-class']) {
            const body = createClassForm(b.school.id);
            body.set('teacherIds', b.membership.id);
            body.set('intent', intent); body.set('classId', own.id);
            body.set('code', ` \t${takenCode.toLowerCase()}\n`);
            const before = await prisma.class.count({ where: { schoolId: b.school.id } });
            const response = await action({ request: new Request('https://example.test/app/my-classes?index', { method: 'POST', body }) } as any);
            expect(actionHttpStatus(response)).toBe(400);
            expect((response as any).data).toEqual({ error: 'Class code already in use. Choose a different code.', field: 'code' });
            expect(await prisma.class.count({ where: { schoolId: b.school.id } })).toBe(before);
            expect((await prisma.class.findUniqueOrThrow({ where: { id: own.id } })).code).toBe(ownCode);
          }
          const body = createClassForm(b.school.id);
          body.set('teacherIds', b.membership.id); body.set('intent', 'edit-class');
          body.set('classId', own.id); body.set('code', ownCode);
          expect(actionHttpStatus(await action({ request: new Request('https://example.test/app/my-classes?index', { method: 'POST', body }) } as any))).toBe(200);
        }
        // Real action transactions serialize a simultaneous teacher/admin collision.
        const raceCode = `RACE${Date.now()}`;
        const results = await Promise.all([myClassesAction, orgClassesAction].map(action => {
          const body = createClassForm(b.school.id); body.set('teacherIds', b.membership.id); body.set('code', raceCode);
          return action({ request: new Request('https://example.test/app/my-classes?index', { method: 'POST', body }) } as any);
        }));
        expect(results.map(actionHttpStatus).sort()).toEqual([200, 400]);
        expect(await prisma.class.count({ where: { code: raceCode } })).toBe(1);
        // Unauthorized code edits never reach a write.
        const body = createClassForm(b.school.id); body.set('intent', 'edit-class'); body.set('classId', taken.id);
        expect(actionHttpStatus(await myClassesAction({ request: new Request('https://example.test/app/my-classes?index', { method: 'POST', body }) } as any))).toBe(404);
        body.set('schoolId', a.school.id);
        expect(actionHttpStatus(await myClassesAction({ request: new Request('https://example.test/app/my-classes?index', { method: 'POST', body }) } as any))).toBe(400);
      } finally {
        if (previous) await prisma.setting.update({ where: { name }, data: { value: previous.value } });
        else await prisma.setting.deleteMany({ where: { name } });
      }
    });
  }
);
