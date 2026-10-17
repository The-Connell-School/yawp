import { afterAll, describe, expect, mock, test } from 'bun:test';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedFreeTierBundleAssignmentTypes } from '../../../../packages/prisma/scripts/seed-free-tier-bundle-assignment-types';
import { normalizeClassCode } from './class';

let candidates: string[] = [];
mock.module('~/utils/class', () => ({ normalizeClassCode, generateClassCode: () => candidates.shift() ?? 'TAKEN1' }));
const { provisionFreeClassroom } = await import('~/domain/free-tier/provision-free-classroom.server');

describe.skipIf(!process.env.DATABASE_URL)('automatic classroom codes (local Postgres)', () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, ssl: false }) });
  const orgIds: string[] = [], userIds: string[] = [], applicationIds: string[] = [];
  const name = 'feature_flag.classcode-unique';
  let previous: { value: string } | null = null;
  let initialized = false;
  async function setup() {
    if (initialized) return;
    initialized = true;
    previous = await db.setting.findUnique({ where: { name } });
    await seedFreeTierBundleAssignmentTypes(db);
    const org = await db.organization.create({ data: { name: 'Code provisioning fixture' } });
    orgIds.push(org.id);
    const school = await db.school.create({ data: { name: 'Code fixture', code: 'code-provision', organizationId: org.id } });
    await db.class.create({ data: { schoolId: school.id, code: 'TAKEN1', schoolYear: '2026-2027' } });
  }
  async function application() {
    const email = `code-provision-${crypto.randomUUID()}@gmail.com`;
    const user = await db.user.create({ data: { email, name: 'Code Test' } }); userIds.push(user.id);
    const app = await db.freeTierApplication.create({ data: {
      email, name: 'Code Test', schoolName: 'Code Test', location: 'Local', gradeLevel: '11', userId: user.id, status: 'APPROVED',
    } }); applicationIds.push(app.id); return app;
  }
  async function flag(value: string) {
    await db.setting.upsert({ where: { name }, create: { name, value, valueType: 'boolean' }, update: { value } });
  }
  afterAll(async () => {
    // Include any org committed by provisioning, even if a later assertion failed.
    const apps = await db.freeTierApplication.findMany({ where: { id: { in: applicationIds } }, select: { organizationId: true } });
    orgIds.push(...apps.flatMap(a => a.organizationId ? [a.organizationId] : []));
    await db.freeTierApplication.deleteMany({ where: { id: { in: applicationIds } } });
    await db.organizationAssignmentType.deleteMany({ where: { organizationId: { in: orgIds } } });
    await db.class.deleteMany({ where: { school: { organizationId: { in: orgIds } } } });
    await db.orgMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
    await db.school.deleteMany({ where: { organizationId: { in: orgIds } } });
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (previous) await db.setting.update({ where: { name }, data: { value: previous.value } });
    else await db.setting.deleteMany({ where: { name } });
    await db.$disconnect();
  });
  test('flag-off provisioning retains cross-organization duplicate behavior and idempotency', async () => {
    await setup(); await flag('false'); const app = await application(); candidates = ['TAKEN1'];
    const result = await provisionFreeClassroom(app.id);
    expect(result.status).toBe('provisioned');
    const updated = await db.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } });
    const klass = await db.class.findFirstOrThrow({ where: { school: { organizationId: updated.organizationId! } } });
    expect(klass.code).toBe('TAKEN1');
    expect((await provisionFreeClassroom(app.id)).status).toBe('already_provisioned');
  });
  test('flag-on provisioning retries global collisions and keeps enrollment membership/bundle', async () => {
    await setup(); await flag('true'); const app = await application(); candidates = ['TAKEN1', 'TAKEN1', 'FRESH1'];
    expect((await provisionFreeClassroom(app.id)).status).toBe('provisioned');
    const updated = await db.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } });
    const klass = await db.class.findFirstOrThrow({ where: { school: { organizationId: updated.organizationId! } }, include: { teachers: true } });
    expect(klass.code).toBe('FRESH1'); expect(klass.teachers).toHaveLength(1);
    expect(await db.organizationAssignmentType.count({ where: { organizationId: updated.organizationId! } })).toBeGreaterThan(0);
  });
  test('exhaustion rolls back organization, membership, class and application link', async () => {
    await setup(); await flag('true'); const app = await application(); candidates = ['TAKEN1', 'TAKEN1', 'TAKEN1', 'TAKEN1'];
    const before = await Promise.all([db.organization.count(), db.school.count(), db.orgMembership.count(), db.class.count()]);
    await expect(provisionFreeClassroom(app.id)).rejects.toThrow('Class code already in use');
    expect(await Promise.all([db.organization.count(), db.school.count(), db.orgMembership.count(), db.class.count()])).toEqual(before);
    expect((await db.freeTierApplication.findUniqueOrThrow({ where: { id: app.id } })).organizationId).toBeNull();
    expect(candidates).toHaveLength(0);
  });
});
