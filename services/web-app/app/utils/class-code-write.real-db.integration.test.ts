import { afterAll, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveClassCode, readDuplicateClassCodes } from './class-code-write.server';

describe.skipIf(!process.env.DATABASE_URL)('global class codes (local Postgres)', () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, ssl: false }) });
  const prefix = `code-proof-${Date.now()}`;
  const orgIds: string[] = [];
  const flagName = 'feature_flag.classcode-unique';
  let previous: { value: string } | null = null;
  let schools: string[] = [];
  async function setup() {
    if (schools.length) return;
    previous = await db.setting.findUnique({ where: { name: flagName } });
    for (let i = 0; i < 2; i++) {
      const org = await db.organization.create({ data: { name: prefix + i } });
      orgIds.push(org.id);
      const school = await db.school.create({ data: { organizationId: org.id, name: prefix, code: prefix + i } });
      schools.push(school.id);
    }
  }
  async function flag(value: string) {
    await db.setting.upsert({ where: { name: flagName }, create: { name: flagName, value, valueType: 'boolean' }, update: { value } });
  }
  const create = (schoolId: string, code: string, generated = false) => db.$transaction(async tx => {
    const resolved = await resolveClassCode(tx, code, { generated });
    return tx.class.create({ data: { schoolId, code: resolved, schoolYear: '2026-2027' } });
  });
  afterAll(async () => {
    await db.class.deleteMany({ where: { schoolId: { in: schools } } });
    await db.school.deleteMany({ where: { id: { in: schools } } });
    await db.organization.deleteMany({ where: { id: { in: orgIds } } });
    if (previous) await db.setting.update({ where: { name: flagName }, data: { value: previous.value } });
    else await db.setting.deleteMany({ where: { name: flagName } });
    await db.$disconnect();
  });
  test('legacy case/whitespace duplicates are reported without writes; unchanged own code edits succeed', async () => {
    await setup(); await flag('false');
    const a = await create(schools[0], `  ${prefix}ß\t`);
    const b = await create(schools[1], `${prefix}SS`.toUpperCase());
    const c = await create(schools[0], `${prefix}SS`.toUpperCase());
    const before = await db.class.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, orderBy: { id: 'asc' } });
    const report = await readDuplicateClassCodes(db);
    const group = report.find(g => g.code === `${prefix}SS`.toUpperCase());
    expect(group?.count).toBe(3);
    expect(group?.classes.map(c => c.organizationId).sort()).toEqual([orgIds[0], orgIds[0], orgIds[1]].sort());
    expect(await db.class.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, orderBy: { id: 'asc' } })).toEqual(before);
    await flag('true');
    const updated = await db.$transaction(async tx => {
      const code = await resolveClassCode(tx, a.code.trim().toUpperCase(), { classId: a.id });
      return tx.class.update({ where: { id: a.id }, data: { code, title: 'Unchanged legacy code' } });
    });
    expect(updated.code).toBe(a.code);
  });
  test('same-organization and cross-organization collisions and code edits reject', async () => {
    await setup(); await flag('true');
    const code = prefix + 'COL';
    await create(schools[0], code);
    await expect(create(schools[0], code.toLowerCase())).rejects.toThrow('Class code already in use');
    await expect(create(schools[1], ' \t' + code + '\n')).rejects.toThrow('Class code already in use');
    const other = await create(schools[1], prefix + 'OTHER');
    await expect(db.$transaction(async tx => {
      const resolved = await resolveClassCode(tx, code, { classId: other.id });
      await tx.class.update({ where: { id: other.id }, data: { code: resolved } });
    })).rejects.toThrow('Class code already in use');
    expect((await db.class.findUniqueOrThrow({ where: { id: other.id } })).code).toBe((prefix + 'OTHER').toUpperCase());
  });
  test('concurrent transactions commit exactly one class across organizations', async () => {
    await setup(); await flag('true');
    const code = prefix + 'RACE';
    const results = await Promise.allSettled(schools.map(id => create(id, code)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await db.class.count({ where: { code: code.toUpperCase() } })).toBe(1);
  });
  test('retry exhaustion rolls back earlier writes and leaves no partial class', async () => {
    await setup(); await flag('true');
    const code = (prefix + 'TAKEN').toUpperCase();
    await create(schools[0], code);
    const organizationCount = await db.organization.count();
    await expect(db.$transaction(async tx => {
      await tx.organization.create({ data: { name: prefix + 'rollback' } });
      await resolveClassCode(tx, code, { generated: true, generate: () => code });
    })).rejects.toThrow('Class code already in use');
    expect(await db.organization.count()).toBe(organizationCount);
  });
});
