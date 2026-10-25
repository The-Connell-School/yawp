import { afterAll, beforeAll, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { organizationClassesTableCookie } from '~/utils/cookies.server';
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
let sortOlderClassId: string;
let sortNewerClassId: string;
let userId: string;
let studentUserId: string;
let appId: string;
let classCode: string;
let joinToken: string;
let codeSearchProbe: string;
let originalFlag: string | null = null;

async function setFlag(value: string) {
  await prisma.setting.upsert({
    where: { name: flag },
    create: { name: flag, value },
    update: { value },
  });
}

function loaderPayload(result: unknown) {
  return result && typeof result === 'object' && 'data' in result
    ? (result as { data: unknown }).data
    : result;
}

function serializedLoaderData(result: unknown) {
  return JSON.stringify(loaderPayload(result));
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

async function authedRequest(path: string, extraCookie?: string) {
  const session = await prisma.session.create({
    data: { userId, expirationDate: new Date(Date.now() + 3600000) },
  });
  const cookie = await authSessionStorage.getSession();
  cookie.set('sessionId', session.id);
  let cookieHeader = (await authSessionStorage.commitSession(cookie)).split(
    ';'
  )[0]!;
  if (extraCookie) {
    cookieHeader = `${cookieHeader}; ${extraCookie}`;
  }
  const headers = { cookie: cookieHeader };
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
  codeSearchProbe = `search-probe-${prefix}`;
  classCode = `${prefix}-${codeSearchProbe}`.toUpperCase();
  joinToken = `${prefix}-join-token`;
  const org = await prisma.organization.create({
    data: { name: prefix, plan: 'FREE_CLASSROOM' },
  });
  orgId = org.id;
  const school = await prisma.school.create({
    data: { organizationId: orgId, name: prefix, code: prefix },
  });
  schoolId = school.id;
  const sortOlder = await prisma.class.create({
    data: {
      schoolId: school.id,
      code: `${prefix}-SORT-ZZZ`.toUpperCase(),
      studentJoinToken: `${prefix}-sort-older-token`,
    },
  });
  sortOlderClassId = sortOlder.id;
  const klass = await prisma.class.create({
    data: {
      schoolId: school.id,
      code: classCode,
      studentJoinToken: joinToken,
    },
  });
  classId = klass.id;
  const sortNewer = await prisma.class.create({
    data: {
      schoolId: school.id,
      code: `${prefix}-SORT-AAA`.toUpperCase(),
      studentJoinToken: `${prefix}-sort-newer-token`,
    },
  });
  sortNewerClassId = sortNewer.id;
  const user = await prisma.user.create({
    data: { name: 'Pending teacher', email: `${prefix}@example.test` },
  });
  userId = user.id;
  const studentUser = await prisma.user.create({
    data: {
      name: 'Enrolled student',
      email: `${prefix}-student@example.test`,
    },
  });
  studentUserId = studentUser.id;
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
  await prisma.orgMembership.create({
    data: {
      userId: studentUserId,
      organizationId: orgId,
      role: 'STUDENT',
      classesAsStudent: { connect: { id: classId } },
    },
  });
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
  const classIds = [classId, sortOlderClassId, sortNewerClassId].filter(Boolean);
  if (classIds.length) {
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  }
  await prisma.school.deleteMany({ where: { organizationId: orgId } });
  await prisma.freeTierApplication.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  if (studentUserId) {
    await prisma.user.deleteMany({ where: { id: studentUserId } });
  }
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
        const serialized = serializedLoaderData(result);
        expectTeachingSecretsAbsent(serialized, {
          requireClassId:
            'requireClassId' in entry ? entry.requireClassId : undefined,
        });
        if (entry.load === orgStudentsLoader) {
          const data = loaderPayload(result) as {
            students: Array<{
              classesAsStudent: Array<{ id: string; code: string | null }>;
            }>;
          };
          const enrolled = data.students.find((student) =>
            student.classesAsStudent.some((klass) => klass.id === classId)
          );
          expect(enrolled).toBeTruthy();
          const nested = JSON.stringify(enrolled!.classesAsStudent);
          expect(nested).toContain(classId);
          expect(nested).not.toContain(joinToken);
          expect(nested).not.toMatch(/"studentJoinToken"\s*:\s*"[^"]+"/);
        }
      } finally {
        await prisma.session.delete({ where: { id: sessionId } });
      }
    }
  }
);

local(
  'pending org owner ignores forged organization-classes-table sort cookies',
  async () => {
    const forgedSortCases = [
      { sort: ['code'] },
      { sort: 'studentJoinToken' },
      { sort: 'nope' },
      { sort: 'code', direction: 'upward' },
    ] as const;

    for (const forged of forgedSortCases) {
      const tableCookie = await organizationClassesTableCookie.serialize({
        sort: forged.sort as unknown as 'code',
        direction: ('direction' in forged ? forged.direction : 'asc') as 'asc',
        skip: 0,
        take: 10,
      });
      const { request, sessionId } = await authedRequest(
        '/app/organization/classes',
        tableCookie
      );
      try {
        const result = await orgClassesLoader({
          request,
          params: {},
          context: {} as never,
        } as never);
        const sortData = loaderPayload(result) as {
          classes: Array<{ id: string }>;
          table: { sort: string; codeSortDisabled?: boolean };
        };
        expect(sortData.classes[0]?.id).toBe(sortOlderClassId);
        expect(sortData.table.sort).toBe('createdAt');
        expect(sortData.table.codeSortDisabled).toBe(true);
      } finally {
        await prisma.session.delete({ where: { id: sessionId } });
      }
    }
  }
);

local(
  'pending org owner cannot search or sort organization classes by code',
  async () => {
    const searchCookie = await organizationClassesTableCookie.serialize({
      sort: 'createdAt',
      direction: 'asc',
      skip: 0,
      take: 10,
    });
    const { request: searchRequest, sessionId: searchSessionId } =
      await authedRequest(
        `/app/organization/classes?q=${encodeURIComponent(codeSearchProbe)}`,
        searchCookie
      );
    try {
      const searchResult = await orgClassesLoader({
        request: searchRequest,
        params: {},
        context: {} as never,
      } as never);
      const searchData = loaderPayload(searchResult) as {
        totalCount: number;
        classes: unknown[];
      };
      expect(searchData.totalCount).toBe(0);
      expect(searchData.classes).toHaveLength(0);
    } finally {
      await prisma.session.delete({ where: { id: searchSessionId } });
    }

    const sortCookie = await organizationClassesTableCookie.serialize({
      sort: 'code',
      direction: 'asc',
      skip: 0,
      take: 10,
    });
    const { request: sortRequest, sessionId: sortSessionId } =
      await authedRequest('/app/organization/classes', sortCookie);
    try {
      const sortResult = await orgClassesLoader({
        request: sortRequest,
        params: {},
        context: {} as never,
      } as never);
        const sortData = loaderPayload(sortResult) as {
          classes: Array<{ id: string }>;
          table: { sort: string; codeSortDisabled?: boolean };
        };
        expect(sortData.classes[0]?.id).toBe(sortOlderClassId);
        expect(sortData.table.sort).toBe('createdAt');
        expect(sortData.table.codeSortDisabled).toBe(true);
    } finally {
      await prisma.session.delete({ where: { id: sortSessionId } });
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

      const searchCookie = await organizationClassesTableCookie.serialize({
        sort: 'createdAt',
        direction: 'asc',
        skip: 0,
        take: 10,
      });
      const { request: searchRequest, sessionId: searchSessionId } =
        await authedRequest(
          `/app/organization/classes?q=${encodeURIComponent(codeSearchProbe)}`,
          searchCookie
        );
      try {
        const searchResult = await orgClassesLoader({
          request: searchRequest,
          params: {},
          context: {} as never,
        } as never);
        const searchData = loaderPayload(searchResult) as { totalCount: number };
        expect(searchData.totalCount).toBeGreaterThan(0);
      } finally {
        await prisma.session.delete({ where: { id: searchSessionId } });
      }

      const sortCookie = await organizationClassesTableCookie.serialize({
        sort: 'code',
        direction: 'asc',
        skip: 0,
        take: 10,
      });
      const { request: sortRequest, sessionId: sortSessionId } =
        await authedRequest('/app/organization/classes', sortCookie);
      try {
        const sortResult = await orgClassesLoader({
          request: sortRequest,
          params: {},
          context: {} as never,
        } as never);
        const sortData = loaderPayload(sortResult) as {
          classes: Array<{ id: string }>;
        };
        const sortOrder = sortData.classes.map((klass) => klass.id);
        const newerIndex = sortOrder.indexOf(sortNewerClassId);
        const olderIndex = sortOrder.indexOf(sortOlderClassId);
        expect(newerIndex).toBeGreaterThan(-1);
        expect(olderIndex).toBeGreaterThan(-1);
        expect(newerIndex).toBeLessThan(olderIndex);
      } finally {
        await prisma.session.delete({ where: { id: sortSessionId } });
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
