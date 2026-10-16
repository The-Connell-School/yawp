import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { PrismaClient, type Prisma } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { prisma } from '~/utils/db.server';
import { signInternalApiRequest } from '~/utils/internal-platform-auth.server';
import { loader, action } from '~/routes/api.internal.v1.free-tier.limits/route';
import { assertFreeClassSeatAvailableInTx, enrollStudentInClassWithSeatCap } from './class-seat-cap.server';
import { FREE_TIER_LIMITS_SETTING, effectiveFreeTierLimits, readFreeTierLimits, updateFreeTierLimits } from './limits.server';
import { assertCanCreateLessonPlan, countOrganizationLessonPlans } from '~/utils/lesson-planner/lesson-planner-quota.server';

const enabled = process.env.FREE_TIER_LIMITS_LOCAL_TEST === '1';
const local = enabled ? test : test.skip;
const prefix = `limits-${Date.now()}`;
const baseFlag = 'feature_flag.free_tier';
const v2Flag = 'feature_flag.free-tier-onboarding-v2';
const savedEnv = { ...process.env };
const url = 'http://localhost/api/internal/v1/free-tier/limits';
const secret = 'local-limits-database-test-secret-32-characters';
let orgId: string;
let classId: string;
let teacherId: string;
const users: string[] = [];
const clients: PrismaClient[] = [];
async function setting(name: string, value: string) {
  await prisma.setting.upsert({ where: { name }, create: { name, value }, update: { value } });
}
function request(method = 'GET', input?: unknown) {
  const body = input === undefined ? '' : JSON.stringify(input);
  return new Request(url, { method, ...(method === 'PUT' ? { body } : {}), headers: {
    ...signInternalApiRequest({ url, method, keyId: 'limits-db-test', secret, actor: 'Staff@Example.test', body }).headers,
    'content-type': 'application/json',
  } });
}
const call = (req: Request) => (req.method === 'GET' ? loader : action)({ request: req } as any);
async function student(suffix: string, enrolled = true) {
  const user = await prisma.user.create({ data: { name: 'Student', email: `${prefix}-${suffix}@example.test` } });
  users.push(user.id);
  return prisma.orgMembership.create({ data: { role: 'STUDENT', organizationId: orgId, userId: user.id,
    ...(enrolled ? { classesAsStudent: { connect: { id: classId } } } : {}),
  } });
}
beforeAll(async () => {
  if (!enabled) return;
  const database = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/yawp_ia-i5-limits')
    throw new Error('Dedicated I5 local database required');
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'limits-db-test', secret, scopes: ['management:read', 'management:write'] }]);
  // Exercise the durable nonce store, not the memory test substitute.
  delete process.env.INTERNAL_API_NONCE_STORE;
  for (let i = 0; i < 2; i++) clients.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: database.toString(), ssl: false }) }));
  const org = await prisma.organization.create({ data: { name: prefix, plan: 'FREE_CLASSROOM' } }); orgId = org.id;
  const school = await prisma.school.create({ data: { name: 'Demo', code: prefix, organizationId: orgId } });
  const klass = await prisma.class.create({ data: { code: 'I5LIMITS', schoolId: school.id, studentJoinToken: prefix } }); classId = klass.id;
  const teacher = await prisma.user.create({ data: { name: 'Teacher', email: `${prefix}-teacher@example.test` } }); users.push(teacher.id);
  const membership = await prisma.orgMembership.create({ data: { organizationId: orgId, userId: teacher.id, role: 'TEACHER',
    classesAsTeacher: { connect: { id: classId } },
  } }); teacherId = membership.id;
});
beforeEach(async () => {
  if (!enabled) return;
  await prisma.setting.deleteMany({ where: { name: FREE_TIER_LIMITS_SETTING } });
  await setting(baseFlag, 'true'); await setting(v2Flag, 'true');
  await prisma.lessonPlanConversation.deleteMany({ where: { organizationId: orgId } });
  await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
  await prisma.orgMembership.deleteMany({ where: { organizationId: orgId, role: 'STUDENT' } });
});
afterAll(async () => {
  if (!enabled) return;
  await prisma.setting.deleteMany({ where: { name: { in: [FREE_TIER_LIMITS_SETTING, baseFlag, v2Flag] } } });
  await prisma.internalPlatformApiAudit.deleteMany({ where: { keyId: 'limits-db-test' } });
  await prisma.internalApiRequestNonce.deleteMany({ where: { keyId: 'limits-db-test' } });
  try {
    if (orgId) {
      await prisma.freeTierApplication.deleteMany({ where: { organizationId: orgId } });
      await prisma.lessonPlanConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.orgMembership.deleteMany({ where: { organizationId: orgId } });
      await prisma.class.deleteMany({ where: { school: { organizationId: orgId } } });
      await prisma.school.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  } finally {
    await Promise.all([...clients.map(client => client.$disconnect()), prisma.$disconnect()]);
    for (const key of ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE']) {
      if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
    }
  }
});

local('HTTP writes survive a separate process and audit the verified staff actor', async () => {
  const result = await call(request('PUT', { version: 0, studentSeatCap: 20, lessonPlannerMonthly: 0 }));
  expect(result.status).toBe(200);
  const state = await result.json();
  const child = Bun.spawn([process.execPath, '-e',
    "import { readFreeTierLimits } from './app/domain/free-tier/limits.server'; import { prisma } from './app/utils/db.server'; console.log('LIMITS_RESULT=' + JSON.stringify(await readFreeTierLimits())); await prisma.$disconnect();"],
    { cwd: process.cwd(), env: { ...process.env }, stdout: 'pipe', stderr: 'pipe' });
  const output = await new Response(child.stdout).text();
  const errors = await new Response(child.stderr).text();
  expect(await child.exited, errors).toBe(0);
  const persisted = output.split('\n').find(line => line.startsWith('LIMITS_RESULT='));
  expect(JSON.parse(persisted!.slice('LIMITS_RESULT='.length))).toEqual(state);
  const audit = await prisma.internalPlatformApiAudit.findFirst({ where: { keyId: 'limits-db-test', result: 'success' }, orderBy: { createdAt: 'desc' } });
  expect(audit?.actorEmail).toBe('staff@example.test');
  expect(audit?.endpoint).toBe('PUT /api/internal/v1/free-tier/limits');
});

// Both real DB reads finish before either SQL write, deterministically exercising
// the absent-row and existing-row compare-and-set races across independent pools.
async function race(version: number) {
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const writers = clients.map(client => ({ setting: new Proxy(client.setting, {
    get(target, property) {
      if (property === 'findUnique') return async (args: any) => {
        const value = await target.findUnique(args);
        if (++arrived === 2) release();
        await barrier; return value;
      };
      return Reflect.get(target, property);
    },
  }) }) as Pick<Prisma.TransactionClient, 'setting'>);
  const values = await Promise.all(writers.map((client, index) =>
    updateFreeTierLimits({ version, studentSeatCap: 50 + index }, `writer${index}@example.test`, client)));
  expect(values.filter(Boolean)).toHaveLength(1); expect(values.filter(value => value === null)).toHaveLength(1);
  const winner = values.find(Boolean)!;
  expect(winner.version).toBe(version + 1);
  expect(await readFreeTierLimits(clients[1])).toEqual(winner);
  expect(winner.updatedByEmail).toBe(`writer${values.indexOf(winner)}@example.test`);
}
local('exactly one concurrent writer initializes version zero', () => race(0));
local('exactly one concurrent writer advances an existing version', async () => {
  await updateFreeTierLimits({ version: 0, lessonPlannerMonthly: 7 }, 'first@example.test');
  await race(1);
  expect((await readFreeTierLimits()).lessonPlannerMonthly).toBe(7);
});
local('concurrent HTTP updates yield one 200 and one unchanged 409 conflict', async () => {
  const results = await Promise.all([40, 45].map(studentSeatCap => call(request('PUT', { version: 0, studentSeatCap }))));
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  const loser = results.find(result => result.status === 409)!;
  expect(await loser.json()).toEqual({ error: 'version_conflict' });
  const winner = await results.find(result => result.status === 200)!.json();
  expect(await readFreeTierLimits()).toEqual(winner);
});
local('durable replay rejection and flag-off writes never change the setting', async () => {
  const req = request('PUT', { version: 0, reporterMonthly: 9 });
  const replay = req.clone();
  expect((await call(req)).status).toBe(200);
  const before = await readFreeTierLimits();
  expect((await call(replay)).status).toBe(401);
  await setting(v2Flag, 'false');
  const off = await call(request('PUT', { version: 1, reporterMonthly: 10 }));
  expect(off.status).toBe(409); expect(await off.json()).toEqual({ error: 'flag_off' });
  expect(await (await call(request())).json()).toEqual(before);
});
local('configured caps include pending invites and block only new enrollment', async () => {
  await updateFreeTierLimits({ version: 0, studentSeatCap: 2 }, 'staff@example.test');
  await student('enrolled');
  const newcomer = await student('new', false);
  await prisma.invitation.create({ data: { type: 'onboard-student', target: `${prefix}-invite@example.test`,
    secret: 'local-only', algorithm: 'SHA256', digits: 6, period: 600, charSet: '0123456789',
    expiresAt: new Date(Date.now() + 60000), studentClassId: classId, organizationId: orgId,
  } });
  const check = () => prisma.$transaction(tx => assertFreeClassSeatAvailableInTx(tx, { classId, organizationId: orgId }));
  expect(await check()).toMatchObject({ ok: false, code: 'class_full' });
  expect(await enrollStudentInClassWithSeatCap({ membershipId: newcomer.id, classId, organizationId: orgId }))
    .toMatchObject({ ok: false, code: 'class_full' });
  await prisma.invitation.updateMany({ where: { organizationId: orgId }, data: { expiresAt: null } });
  expect(await check()).toMatchObject({ ok: false, code: 'class_full' });
  await prisma.invitation.updateMany({ where: { organizationId: orgId }, data: { expiresAt: new Date(0) } });
  expect(await check()).toMatchObject({ ok: true });
  expect(await enrollStudentInClassWithSeatCap({ membershipId: newcomer.id, classId, organizationId: orgId })).toEqual({ ok: true });
  await updateFreeTierLimits({ version: 1, studentSeatCap: 1 }, 'staff@example.test');
  expect(await check()).toMatchObject({ ok: false, code: 'class_full' });
  expect(await prisma.orgMembership.count({ where: { organizationId: orgId, role: 'STUDENT', isActive: true,
    classesAsStudent: { some: { id: classId } } } })).toBe(2);
  const { enrollExistingStudentByCode } = await import('./existing-student-enrollment.server');
  await prisma.freeTierApplication.create({ data: { name: 'Teacher', email: `${prefix}-application@example.test`,
    schoolName: 'Demo', location: 'Here', gradeLevel: '11', status: 'APPROVED', organizationId: orgId,
  } });
  const existing = await enrollExistingStudentByCode({ userId: newcomer.userId,
    sourceOrganizationId: orgId, sourceMembershipId: newcomer.id, code: 'I5LIMITS', classId });
  expect(existing.ok).toBe(true);
});
local('flag-off, targeted organizations, base access and paid seats retain rollout behavior', async () => {
  await updateFreeTierLimits({ version: 0, studentSeatCap: 1 }, 'staff@example.test');
  await student('rollout');
  const check = () => prisma.$transaction(tx => assertFreeClassSeatAvailableInTx(tx, { classId, organizationId: orgId }));
  await setting(v2Flag, 'false'); expect(await check()).toMatchObject({ ok: true });
  await setting(v2Flag, JSON.stringify({ mode: 'targeted', orgIds: ['another'] }));
  expect(await check()).toMatchObject({ ok: true });
  await setting(v2Flag, JSON.stringify({ mode: 'targeted', orgIds: [orgId] }));
  expect(await check()).toMatchObject({ ok: false, code: 'class_full' });
  const write = await call(request('PUT', { version: 1, studentSeatCap: 2 }));
  expect(write.status).toBe(409); expect(await write.json()).toEqual({ error: 'flag_off' });
  await setting(baseFlag, 'false'); expect(await check()).toMatchObject({ ok: true });
  expect((await effectiveFreeTierLimits(orgId)).limits.studentSeatCap).toBe(35);
  await setting(baseFlag, 'true'); await setting(v2Flag, 'true');
  await prisma.organization.update({ where: { id: orgId }, data: { plan: 'SCHOOL' } });
  try { expect(await check()).toMatchObject({ ok: true }); }
  finally { await prisma.organization.update({ where: { id: orgId }, data: { plan: 'FREE_CLASSROOM' } }); }
});
local('monthly Lesson Planner uses calendar boundaries and counts deleted uses; legacy stays lifetime', async () => {
  const now = new Date('2026-12-31T23:59:59.999Z');
  await prisma.lessonPlanConversation.createMany({ data: [
    { createdAt: new Date('2026-11-30T23:59:59.999Z'), deletedAt: null },
    { createdAt: new Date('2026-12-01T00:00:00Z'), deletedAt: null },
    { createdAt: now, deletedAt: now },
    { createdAt: new Date('2027-01-01T00:00:00Z'), deletedAt: null },
  ].map(value => ({ ...value, organizationId: orgId, membershipId: teacherId })) });
  expect(await countOrganizationLessonPlans(orgId, true, now)).toBe(2);
  expect(await countOrganizationLessonPlans(orgId, true, new Date('2027-01-01T00:00:00Z'))).toBe(1);
  expect(await countOrganizationLessonPlans(orgId)).toBe(3);
  await updateFreeTierLimits({ version: 0, lessonPlannerMonthly: 0, reporterMonthly: 100 }, 'staff@example.test');
  await expect(assertCanCreateLessonPlan({ organizationId: orgId, plan: 'FREE_CLASSROOM' })).rejects.toMatchObject({ quota: 0, monthly: true });
  await expect(assertCanCreateLessonPlan({ organizationId: orgId, plan: 'SCHOOL' })).resolves.toBeUndefined();
  await setting(v2Flag, 'false');
  await expect(assertCanCreateLessonPlan({ organizationId: orgId, plan: 'FREE_CLASSROOM' })).resolves.toBeUndefined();
});
