import { afterAll, beforeAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { loader as appShellLoader } from '~/routes/app/route';
import { loader as dashboardLoader } from '~/routes/app._index/route';
import { loader as myClassesLoader } from '~/routes/app.my-classes._index/route';
import { loader as classDetailLoader } from '~/routes/app.my-classes.$classId/route';
import { loader as orgClassesLoader } from '~/routes/app.organization.classes/route';
import { loader as orgStudentsLoader } from '~/routes/app.organization.students/route';
import { loader as schoolDetailLoader } from '~/routes/app.organizations.schools.$schoolId/route';

const enabled = process.env.LOCKED_PREVIEW_DB_TESTS === '1';
const local = enabled ? test : test.skip;
const prefix = `teaching-secrets-${Date.now()}`;
const flag = 'feature_flag.free_tier';
let orgId: string;
let schoolId: string;
let classId: string;
let userId: string;
let appId: string;
let classCode: string;
let joinToken: string;
let originalFlag: string | null = null;

async function setFlag(value: string) {
  await prisma.setting.upsert({
    where: { name: flag },
    create: { name: flag, value },
    update: { value },
  });
}

function serializedLoaderData(result: unknown) {
  const payload =
    result && typeof result === 'object' && 'data' in result
      ? (result as { data: unknown }).data
      : result;
  return JSON.stringify(payload);
}

function expectTeachingSecretsAbsent(
  serialized: string,
  options?: { requireClassId?: boolean }
) {
  expect(serialized).not.toContain(classCode);
  expect(serialized).not.toContain(joinToken);
  expect(serialized).not.toMatch(/"studentJoinToken"\s*:\s*"[^"]+"/);
  if (options?.requireClassId !== false) {
    expect(serialized).toContain(classId);
  }
}

function expectTeachingSecretsPresent(serialized: string) {
  expect(serialized).toContain(classCode);
  expect(serialized).toContain(joinToken);
}

async function authedRequest(path: string) {
  const session = await prisma.session.create({
    data: { userId, expirationDate: new Date(Date.now() + 3600000) },
  });
  const cookie = await authSessionStorage.getSession();
  cookie.set('sessionId', session.id);
  const headers = {
    cookie: (await authSessionStorage.commitSession(cookie)).split(';')[0]!,
  };
  return {
    request: new Request(`http://localhost${path}`, { headers }),
    sessionId: session.id,
  };
}

beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw Error('Local database required');
  }
  originalFlag =
    (await prisma.setting.findUnique({ where: { name: flag } }))?.value ??
    null;
  classCode = `${prefix}-code`.toUpperCase();
  joinToken = `${prefix}-join-token`;
  const org = await prisma.organization.create({
    data: { name: prefix, plan: 'FREE_CLASSROOM' },
  });
  orgId = org.id;
  const school = await prisma.school.create({
    data: { organizationId: orgId, name: prefix, code: prefix },
  });
  schoolId = school.id;
  const klass = await prisma.class.create({
    data: {
      schoolId: school.id,
      code: classCode,
      studentJoinToken: joinToken,
    },
  });
  classId = klass.id;
  const user = await prisma.user.create({
    data: { name: 'Pending teacher', email: `${prefix}@example.test` },
  });
  userId = user.id;
  const member = await prisma.orgMembership.create({
    data: {
      userId,
      organizationId: orgId,
      role: 'TEACHER',
      isOrgOwner: true,
      classesAsTeacher: { connect: { id: classId } },
    },
  });
  void member.id;
  const app = await prisma.freeTierApplication.create({
    data: {
      userId,
      organizationId: orgId,
      name: 'Pending teacher',
      email: `${prefix}@example.test`,
      schoolName: prefix,
      location: 'Local',
      gradeLevel: '11',
      status: 'SENT',
    },
  });
  appId = app.id;
  await setFlag(JSON.stringify({ mode: 'targeted', orgIds: [orgId] }));
});

afterAll(async () => {
  if (!enabled) return;
  if (!orgId) {
    await prisma.$disconnect();
    return;
  }
  if (originalFlag === null) {
    await prisma.setting.deleteMany({ where: { name: flag } });
  } else {
    await setFlag(originalFlag);
  }
  if (appId) {
    await prisma.freeTierApplication.deleteMany({ where: { id: appId } });
  }
  await prisma.orgMembership.deleteMany({ where: { organizationId: orgId } });
  if (classId) await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.school.deleteMany({ where: { organizationId: orgId } });
  await prisma.freeTierApplication.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

local(
  'pending teacher app loaders omit the real class code from serialized loader data',
  async () => {
    const paths = [
      {
        path: '/app',
        load: appShellLoader,
        params: {},
        requireClassId: false,
      },
      { path: '/app', load: dashboardLoader, params: {} },
      { path: '/app/my-classes', load: myClassesLoader, params: {} },
      {
        path: `/app/my-classes/${classId}?tab=students`,
        load: classDetailLoader,
        params: { classId },
      },
      {
        path: '/app/organization/classes',
        load: orgClassesLoader,
        params: {},
      },
      {
        path: '/app/organization/students',
        load: orgStudentsLoader,
        params: {},
      },
      {
        path: `/app/organizations/schools/${schoolId}`,
        load: schoolDetailLoader,
        params: { schoolId },
      },
    ] as const;

    for (const entry of paths) {
      const { request, sessionId } = await authedRequest(entry.path);
      try {
        const result = await entry.load({
          request,
          params: entry.params,
          context: {} as never,
        } as never);
        expectTeachingSecretsAbsent(serializedLoaderData(result), {
          requireClassId:
            'requireClassId' in entry ? entry.requireClassId : undefined,
        });
      } finally {
        await prisma.session.delete({ where: { id: sessionId } });
      }
    }
  }
);

local(
  'approved org owner loaders still include class code and join token where expected',
  async () => {
    await prisma.freeTierApplication.update({
      where: { id: appId },
      data: { status: 'APPROVED' },
    });
    try {
      const orgPaths = [
        ['/app/organization/classes', orgClassesLoader, {}] as const,
        ['/app/organization/students', orgStudentsLoader, {}] as const,
        [
          `/app/organizations/schools/${schoolId}`,
          schoolDetailLoader,
          { schoolId },
        ] as const,
      ];

      for (const [path, load, params] of orgPaths) {
        const { request, sessionId } = await authedRequest(path);
        try {
          const result = await load({
            request,
            params,
            context: {} as never,
          } as never);
          expectTeachingSecretsPresent(serializedLoaderData(result));
        } finally {
          await prisma.session.delete({ where: { id: sessionId } });
        }
      }

      const { request, sessionId } = await authedRequest('/app');
      try {
        const dashboard = await dashboardLoader({
          request,
          params: {},
          context: {} as never,
        } as never);
        const dashboardSerialized = serializedLoaderData(dashboard);
        expect(dashboardSerialized).toContain(classCode);
        expect(dashboardSerialized).toMatch(/"teacherClasses":\[[^\]]*"code"/);

        // App shell only surfaces classCode inside freeAccountUsage when in-app
        // metering is active for the org; this fixture does not enable that path.
        const shell = await appShellLoader({
          request,
          params: {},
          context: {} as never,
        } as never);
        expect(serializedLoaderData(shell)).not.toContain(classCode);
      } finally {
        await prisma.session.delete({ where: { id: sessionId } });
      }
    } finally {
      await prisma.freeTierApplication.update({
        where: { id: appId },
        data: { status: 'SENT' },
      });
    }
  }
);
