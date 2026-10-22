import { afterAll, beforeAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { loader as appShellLoader } from '~/routes/app/route';
import { loader as dashboardLoader } from '~/routes/app._index/route';
import { loader as myClassesLoader } from '~/routes/app.my-classes._index/route';
import { loader as classDetailLoader } from '~/routes/app.my-classes.$classId/route';

const enabled = process.env.LOCKED_PREVIEW_DB_TESTS === '1';
const local = enabled ? test : test.skip;
const prefix = `teaching-secrets-${Date.now()}`;
const flag = 'feature_flag.free_tier';
let orgId: string;
let classId: string;
let userId: string;
let appId: string;
let classCode: string;
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
  const org = await prisma.organization.create({
    data: { name: prefix, plan: 'FREE_CLASSROOM' },
  });
  orgId = org.id;
  const school = await prisma.school.create({
    data: { organizationId: orgId, name: prefix, code: prefix },
  });
  const klass = await prisma.class.create({
    data: { schoolId: school.id, code: classCode },
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
  await prisma.organization.deleteMany({ where: { id: orgId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

local(
  'pending teacher app loaders omit the real class code from serialized loader data',
  async () => {
    const paths = [
      ['/app', appShellLoader, {}] as const,
      ['/app', dashboardLoader, {}] as const,
      ['/app/my-classes', myClassesLoader, {}] as const,
      [
        `/app/my-classes/${classId}?tab=students`,
        classDetailLoader,
        { classId },
      ] as const,
    ];

    for (const [path, load, params] of paths) {
      const { request, sessionId } = await authedRequest(path);
      try {
        const result = await load({
          request,
          params,
          context: {} as never,
        } as never);
        const serialized = serializedLoaderData(result);
        expect(serialized).not.toContain(classCode);
      } finally {
        await prisma.session.delete({ where: { id: sessionId } });
      }
    }
  }
);

local(
  'approved teacher app loaders still include the real class code where expected',
  async () => {
    await prisma.freeTierApplication.update({
      where: { id: appId },
      data: { status: 'APPROVED' },
    });
    try {
      const { request, sessionId } = await authedRequest('/app');
      try {
        const shell = await appShellLoader({
          request,
          params: {},
          context: {} as never,
        } as never);
        expect(serializedLoaderData(shell)).toContain(classCode);

        const dashboard = await dashboardLoader({
          request,
          params: {},
          context: {} as never,
        } as never);
        expect(serializedLoaderData(dashboard)).toContain(classCode);
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
