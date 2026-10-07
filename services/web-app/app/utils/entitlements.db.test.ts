import { afterAll, describe, expect, test } from 'bun:test';
import { basePrisma as prisma } from './db.server';
import { getEntitlements } from './entitlements.server';

const created: string[] = [];

afterAll(async () => {
  try {
    await prisma.organization.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

describe('DB integration: default org plan and reporter access', () => {
  test('a newly created org defaults to plan=SCHOOL and reporter remains allowed', async () => {
    const org = await prisma.organization.create({
      data: { name: `Entitlements Test Org ${Date.now()}` },
    });
    created.push(org.id);
    expect(org.plan).toBe('SCHOOL');
    expect(org.planActivatedAt).toBeNull();
    expect(org.planExpiresAt).toBeNull();
    const e = getEntitlements(org);
    expect(e.plan).toBe('SCHOOL');
    expect(e.features.reporter).toBe(true);
  });

  test('a legacy row inserted without the plan columns reads back as SCHOOL', async () => {
    // Mirrors rows that existed before the migration: no plan value supplied.
    const id = `legacy-plan-${Date.now()}`;
    await prisma.$executeRaw`INSERT INTO "Organization" ("id", "name") VALUES (${id}, 'Legacy Org')`;
    created.push(id);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id } });
    expect(org.plan).toBe('SCHOOL');
    expect(getEntitlements(org).features.reporter).toBe(true);
  });

  test('FREE_CLASSROOM round-trips and turns the reporter off', async () => {
    const org = await prisma.organization.create({
      data: { name: `Free Test Org ${Date.now()}`, plan: 'FREE_CLASSROOM' },
    });
    created.push(org.id);
    expect(getEntitlements(org).features.reporter).toBe(false);
  });
});
