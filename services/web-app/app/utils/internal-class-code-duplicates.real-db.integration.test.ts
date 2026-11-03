import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { PrismaClient } from '@app/prisma';
import { prisma } from './db.server';
import { readDuplicateClassCodes } from './class-code-write.server';
import { readDuplicateClassCodePage } from './internal-class-code-duplicates.server';
import { signInternalApiRequest } from './internal-platform-auth.server';
import { loader } from '~/routes/api.internal.v1.class-codes.duplicates/route';

const enabled = process.env.CLASS_CODE_DUPLICATES_LOCAL_TEST === '1';
const local = enabled ? test : test.skip;
const prefix = `i3-${Date.now()}`;
const secret = 'local-duplicate-class-code-test-secret';
const keyId = prefix;
const flags = ['feature_flag.free_tier', 'feature_flag.classcode-unique'];
const savedEnv = { ...process.env };
let savedFlags: { name: string; value: string }[] = [];
let localDatabaseValidated = false;
const orgs: string[] = [];
const schools: string[] = [];
const classes: string[] = [];
const users: string[] = [];
let assignmentTypeId: string;
let assignmentId: string;
let activeClassId: string;
const createdAt = new Date('2026-10-16T09:00:00-03:00');
const lastActivityAt = new Date('2026-10-16T15:00:00+02:00');
const canonical = (suffix: string) => (prefix + suffix).toUpperCase();
async function read(query = '') {
  const url = 'http://localhost/api/internal/v1/class-codes/duplicates' + query;
  return loader({ request: new Request(url, { headers: signInternalApiRequest({
    url, method: 'GET', keyId, secret, actor: 'staff@example.test',
  }).headers }) } as any);
}
async function snapshot() {
  return {
    classes: await prisma.class.findMany({ where: { id: { in: classes } }, orderBy: { id: 'asc' }, include: { students: true, teachers: true } }),
    documents: await prisma.document.findMany({ where: { assignmentTypeId }, orderBy: { id: 'asc' } }),
    organizations: await prisma.organization.findMany({ where: { id: { in: orgs } }, orderBy: { id: 'asc' } }),
    flags: await prisma.setting.findMany({ where: { name: { in: flags } }, orderBy: { name: 'asc' } }),
    auditCount: await prisma.internalPlatformApiAudit.count(),
  };
}
beforeAll(async () => {
  if (!enabled) return;
  const database = new URL(process.env.E2E_DATABASE_URL || process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.startsWith('/yawp_ia-i3-dupes'))
    throw new Error('Dedicated I3 local database required');
  localDatabaseValidated = true;
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: keyId, secret, scopes: ['management:read'] }]);
  delete process.env.INTERNAL_API_NONCE_STORE;
  savedFlags = await prisma.setting.findMany({ where: { name: { in: flags } }, select: { name: true, value: true } });
  for (const name of flags) await prisma.setting.upsert({ where: { name }, create: { name, value: 'false' }, update: { value: 'false' } });
  for (let i = 0; i < 2; i++) {
    const org = await prisma.organization.create({ data: { name: prefix + '-org-' + i } }); orgs.push(org.id);
    const school = await prisma.school.create({ data: { name: prefix + '-demo-' + i, code: prefix + i, organizationId: org.id } }); schools.push(school.id);
  }
  for (const [index, code] of [` \t${prefix}ß\n`, canonical('SS'), canonical('ss').toLowerCase(),
    `${prefix}ı`, canonical('I'), `${prefix}ﬀ`, canonical('FF'), prefix + 'unique'].entries()) {
    const row = await prisma.class.create({ data: { schoolId: schools[index % 2], code,
      title: index === 0 ? 'AP English 11' : null, isArchived: index === 0, createdAt } });
    classes.push(row.id);
  }
  activeClassId = classes[0]!;
  let studentId = '';
  for (const [index, role] of ['TEACHER', 'TEACHER', 'STUDENT', 'STUDENT'].entries()) {
    const email = `${index === 0 ? 'z' : 'a'}-${prefix}-${index}@example.test`;
    const user = await prisma.user.create({ data: { name: role, email } }); users.push(user.id);
    const member = await prisma.orgMembership.create({ data: { userId: user.id, organizationId: orgs[0]!,
      role: role as 'TEACHER' | 'STUDENT', isActive: index !== 3,
      ...(role === 'TEACHER' ? { classesAsTeacher: { connect: { id: activeClassId } } }
        : { classesAsStudent: { connect: { id: activeClassId } } }),
    } });
    if (role === 'STUDENT') studentId = member.id;
  }
  const type = await prisma.assignmentType.create({ data: { title: prefix, position: 0 } }); assignmentTypeId = type.id;
  const assignment = await prisma.assignment.create({ data: { assignmentTypeId, prompt: 'Local fixture' } }); assignmentId = assignment.id;
  const deployment = await prisma.classAssignment.create({ data: { assignmentId, classId: activeClassId } });
  for (const updatedAt of [createdAt, lastActivityAt]) await prisma.document.create({ data: {
    assignmentTypeId, assignmentId, classAssignmentId: deployment.id, membershipId: studentId,
    updatedAt, archivedAt: updatedAt === lastActivityAt ? lastActivityAt : null,
  } });
  // A newer unrelated document must not leak into a class's activity.
  await prisma.document.create({ data: { assignmentTypeId, membershipId: studentId, updatedAt: new Date('2027-01-01T00:00:00Z') } });
});
afterAll(async () => {
  if (!enabled || !localDatabaseValidated) return;
  if (assignmentTypeId) await prisma.document.deleteMany({ where: { assignmentTypeId } });
  if (assignmentId) await prisma.assignment.delete({ where: { id: assignmentId } });
  if (assignmentTypeId) await prisma.assignmentType.delete({ where: { id: assignmentTypeId } });
  await prisma.class.deleteMany({ where: { id: { in: classes } } });
  await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.school.deleteMany({ where: { id: { in: schools } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.internalApiRequestNonce.deleteMany({ where: { keyId } });
  for (const name of flags) {
    const old = savedFlags.find(row => row.name === name);
    if (old) await prisma.setting.update({ where: { name }, data: { value: old.value } });
    else await prisma.setting.deleteMany({ where: { name } });
  }
  for (const name of ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE']) {
    if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name];
  }
  await prisma.$disconnect();
});
local('real relation enrichment matches the shared report, including archived cross-organization Unicode collisions', async () => {
  const response = await read('?q=' + prefix);
  expect(response.status).toBe(200);
  const result = await response.json();
  const report = (await readDuplicateClassCodes(prisma)).filter(group => group.code.startsWith(canonical('')));
  expect(result.totalCodes).toBe(3);
  expect(result.items.map((group: any) => ({ code: group.code, count: group.count, classes: group.classes.map((row: any) => ({
    classId: row.classId, organizationId: row.organizationId, schoolId: row.schoolId,
  })) }))).toEqual(report.map(group => ({ ...group, classes: group.classes.map(({ storedCode, ...row }) => row) })));
  const active = result.items.flatMap((group: any) => group.classes).find((row: any) => row.classId === activeClassId);
  expect(active).toEqual({ classId: activeClassId, className: 'AP English 11', organizationId: orgs[0],
    organizationName: prefix + '-org-0', schoolId: schools[0], schoolName: prefix + '-demo-0',
    teacherEmails: [`a-${prefix}-1@example.test`, `z-${prefix}-0@example.test`], studentCount: 2,
    createdAt: '2026-10-16T12:00:00.000Z', lastActivityAt: '2026-10-16T13:00:00.000Z' });
  const empty = result.items.flatMap((group: any) => group.classes).find((row: any) => row.classId === classes[1]);
  expect(empty).toMatchObject({ className: canonical('SS'), teacherEmails: [], studentCount: 0, lastActivityAt: null });
});
local('first, middle and last real pages have stable totals, no split groups, no skipped or repeated codes', async () => {
  let cursor: string | null = null;
  const items = [];
  do {
    const response = await read('?q=' + prefix + '&limit=1' + (cursor ? '&cursor=' + cursor : ''));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.totalCodes).toBe(3); expect(result.items).toHaveLength(1);
    items.push(...result.items); cursor = result.nextCursor;
  } while (cursor);
  expect(items.map(row => row.code)).toEqual([canonical('FF'), canonical('I'), canonical('SS')]);
  expect(items.map(row => row.count)).toEqual([2, 2, 3]);
  for (const item of items) expect(item.classes).toHaveLength(item.count);
  expect((await (await read('?q=' + prefix + 'unique')).json()).totalCodes).toBe(0);
});
local('all rollout flags off still permits inspection; reads change only request replay records', async () => {
  const before = await snapshot();
  const nonceCount = await prisma.internalApiRequestNonce.count({ where: { keyId } });
  expect((await read('?q=' + prefix)).status).toBe(200);
  expect(await snapshot()).toEqual(before);
  expect(await prisma.internalApiRequestNonce.count({ where: { keyId } })).toBe(nonceCount + 1);
});
local('durable replay protection denies the same signed request', async () => {
  const url = 'http://localhost/api/internal/v1/class-codes/duplicates?q=' + prefix;
  const headers = signInternalApiRequest({ url, method: 'GET', keyId, secret, actor: 'staff@example.test' }).headers;
  expect((await loader({ request: new Request(url, { headers }) } as any)).status).toBe(200);
  const denied = await loader({ request: new Request(url, { headers }) } as any);
  expect(denied.status).toBe(401); expect(await denied.json()).toEqual({ error: 'Unauthorized' });
});
local('PostgreSQL enforces read-only mode before the class scan', async () => {
  // Inject a domain write at the first scan; the report must reject it at the DB.
  const instrumented = { $transaction: (work: any, options: any) => prisma.$transaction(tx => work(new Proxy(tx, {
    get(target, property) {
      if (property === 'class') return { findMany: async () => {
        await tx.class.update({ where: { id: activeClassId }, data: { title: 'Forbidden mutation' } });
        return [];
      } };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  })), options) } as unknown as PrismaClient;
  await expect(readDuplicateClassCodePage(instrumented, { q: prefix, limit: 50 })).rejects.toThrow('read-only transaction');
  expect((await prisma.class.findUniqueOrThrow({ where: { id: activeClassId } })).title).toBe('AP English 11');
});
