import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import { dispatchUnifiedLogin } from './entry.server';
import { signedInTeacherPromptEntry } from './teacher-prompts.server';
import { crossTenantClassCodeCollisionError } from './classes.server';

const enabled = process.env.SIGNON_LOCAL_TEST === '1';
const suite = enabled ? test : test.skip;
const tag = `uso-collision-${Date.now()}`;
const collisionCode = `${tag}-collide`;
let cookie = '';
let flowToken = '';
const url = 'http://127.0.0.1:5396/auth/login';
const homeOrgId = `${tag}-home`;
const foreignOrgId = `${tag}-foreign`;
const homeClassId = `${tag}-home-class`;
const foreignClassId = `${tag}-foreign-class`;
const foreignSchoolName = `${tag} Foreign Academy`;
const foreignTeacherName = `${tag} Foreign Teacher`;
const activeStudentId = `${tag}-active`;
const inactiveStudentId = `${tag}-inactive`;

async function post(
  intent: string,
  values: Record<string, string> = {},
  useCookie: string | null = cookie
) {
  const request = new Request(url, {
    method: 'POST',
    headers: {
      ...(useCookie ? { cookie: useCookie } : {}),
      'x-forwarded-for': `198.18.${Math.floor(Math.random() * 200)}.1`,
    },
    body: new URLSearchParams({ intent, flowToken, ...values }),
  });
  const result = await dispatchUnifiedLogin({
    request,
    params: {},
    context: {},
  } as any);
  const response =
    result instanceof Response
      ? result
      : Response.json(result, { status: 400 });
  for (const entry of response.headers.getSetCookie()) {
    const pair = entry.split(';')[0];
    const name = pair.split('=')[0];
    cookie = cookie
      .split('; ')
      .filter((part) => part && !part.startsWith(`${name}=`))
      .concat(pair)
      .join('; ');
  }
  const data = response.headers.get('content-type')?.includes('json')
    ? await response.json()
    : null;
  if (data?.state?.flowToken) flowToken = data.state.flowToken;
  return { response, data };
}

async function authSession(userId: string) {
  const { authSessionStorage } =
    await import('~/cookie-session-storages/authentication.server');
  const { sessionKey } = await import('~/utils/auth.server');
  const row = await prisma.session.create({
    data: { userId, expirationDate: new Date(Date.now() + 600000) },
  });
  const session = await authSessionStorage.getSession();
  session.set(sessionKey, row.id);
  const authCookie = (await authSessionStorage.commitSession(session)).split(
    ';'
  )[0];
  return `${authCookie}; ${cookie}`.trim();
}

async function teacherPromptFlow(userId: string, screen: 'class-code' | 'inactive') {
  const sessionCookie = await authSession(userId);
  const loaded = await signedInTeacherPromptEntry(
    new Request(url, { headers: { cookie: sessionCookie } }),
    userId,
    screen
  );
  expect(loaded).not.toBeNull();
  const body = loaded as {
    data: { teacherPromptEntry: { initialState: { flowToken: string } } };
    init?: { headers?: HeadersInit };
  };
  flowToken = body.data.teacherPromptEntry.initialState.flowToken;
  const headers = new Headers(body.init?.headers);
  const signon = headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .find((entry) => entry.startsWith('yawp_signon='));
  cookie = signon ? `${sessionCookie}; ${signon}` : sessionCookie;
}

beforeAll(async () => {
  if (!enabled) return;
  if (
    !['127.0.0.1', 'localhost'].includes(
      new URL(process.env.DATABASE_URL!).hostname
    )
  )
    throw new Error('Local database required');
  await prisma.setting.upsert({
    where: { name: 'feature_flag.unified-sign-on' },
    update: { value: 'true' },
    create: {
      name: 'feature_flag.unified-sign-on',
      value: 'true',
      valueType: 'boolean',
    },
  });
  await prisma.setting.upsert({
    where: { name: 'feature_flag.free_tier' },
    update: { value: 'true' },
    create: {
      name: 'feature_flag.free_tier',
      value: 'true',
      valueType: 'boolean',
    },
  });
  for (const [id, plan] of [
    [homeOrgId, 'SCHOOL'],
    [foreignOrgId, 'FREE_CLASSROOM'],
  ] as const) {
    await prisma.organization.create({
      data: { id, name: id, plan },
    });
    await prisma.school.create({
      data: {
        id: `${id}-school`,
        code: `${id}-school`,
        name: id === foreignOrgId ? foreignSchoolName : `${id} school`,
        organizationId: id,
      },
    });
  }
  await prisma.class.create({
    data: {
      id: homeClassId,
      code: collisionCode,
      title: 'Home collision class',
      schoolId: `${homeOrgId}-school`,
    },
  });
  const foreignTeacher = await prisma.user.create({
    data: {
      id: `${tag}-foreign-teacher`,
      name: foreignTeacherName,
      email: `${tag}-foreign-teacher@yawp.local`,
    },
  });
  await prisma.class.create({
    data: {
      id: foreignClassId,
      code: collisionCode,
      title: 'Foreign collision class',
      schoolId: `${foreignOrgId}-school`,
      studentJoinToken: `${tag}-foreign-join`,
      teachers: {
        create: {
          userId: foreignTeacher.id,
          organizationId: foreignOrgId,
          role: 'TEACHER',
          isOrgOwner: true,
        },
      },
    },
  });
  await prisma.freeTierApplication.create({
    data: {
      name: tag,
      email: `${tag}@yawp.local`,
      schoolName: foreignSchoolName,
      location: 'Local',
      gradeLevel: '10',
      organizationId: foreignOrgId,
      status: 'APPROVED',
    },
  });
  await prisma.user.create({
    data: {
      id: activeStudentId,
      name: 'Active Maya',
      email: `${activeStudentId}@yawp.local`,
      memberships: {
        create: {
          id: `${activeStudentId}-member`,
          organizationId: homeOrgId,
          role: 'STUDENT',
          isActive: true,
        },
      },
    },
  });
  await prisma.user.create({
    data: {
      id: inactiveStudentId,
      name: 'Inactive Maya',
      email: `${inactiveStudentId}@yawp.local`,
      memberships: {
        create: {
          id: `${inactiveStudentId}-member`,
          organizationId: homeOrgId,
          role: 'STUDENT',
          isActive: false,
        },
      },
    },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await prisma.signonFlow.deleteMany({
    where: { data: { path: ['userId'], string_starts_with: tag } },
  });
  await prisma.session.deleteMany({
    where: { userId: { in: [activeStudentId, inactiveStudentId] } },
  });
  await prisma.freeTierApplication.deleteMany({
    where: { organizationId: foreignOrgId },
  });
  await prisma.orgMembership.deleteMany({
    where: { organizationId: { in: [homeOrgId, foreignOrgId] } },
  });
  await prisma.class.deleteMany({
    where: { id: { startsWith: tag } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: tag } },
  });
  await prisma.school.deleteMany({
    where: { organizationId: { in: [homeOrgId, foreignOrgId] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [homeOrgId, foreignOrgId] } },
  });
});

beforeEach(() => {
  cookie = '';
  flowToken = '';
});

suite(
  'logged-out /auth/login class-code entry fails closed on cross-tenant collisions',
  async () => {
    cookie = '';
    const resolved = await post('resolve', { identifier: collisionCode }, null);
    expect(resolved.response.status).toBe(400);
    expect(resolved.data.fieldErrors?.identifier).toBe(
      crossTenantClassCodeCollisionError().message
    );
    expect(JSON.stringify(resolved.data)).not.toContain(foreignSchoolName);
    expect(JSON.stringify(resolved.data)).not.toContain(foreignTeacherName);
    expect(JSON.stringify(resolved.data)).not.toContain('Foreign collision');
  }
);

suite(
  'signed-in /enter-code teacher prompt org-scopes class-code resolution',
  async () => {
    await teacherPromptFlow(activeStudentId, 'class-code');
    const resolved = await post('resolve-class', { classCode: collisionCode });
    expect(JSON.stringify(resolved.data)).not.toContain(foreignSchoolName);
    expect(JSON.stringify(resolved.data)).not.toContain(foreignTeacherName);
    expect(JSON.stringify(resolved.data)).not.toContain('Foreign collision');
    expect(resolved.data.state?.variant).not.toBe('multiple');
    expect(
      resolved.data.state?.classInfo?.name ?? resolved.data.state?.classInfo
    ).toMatch(/Home collision/i);
  }
);

suite(
  '/no-membership inactive student can join a unique home-org class without foreign leakage',
  async () => {
    await teacherPromptFlow(inactiveStudentId, 'inactive');
    const resolved = await post('resolve-class', { classCode: collisionCode });
    expect(JSON.stringify(resolved.data)).not.toContain(foreignSchoolName);
    expect(JSON.stringify(resolved.data)).not.toContain('Foreign collision');
    expect(resolved.data.state?.variant).not.toBe('multiple');
  }
);
