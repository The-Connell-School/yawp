import { afterAll, describe, expect, test } from 'bun:test';
import { basePrisma as prisma } from './db.server';
import { getEntitlements } from './entitlements.server';

describe('DB integration: default org plan and reporter access', () => {
  test('a newly created org defaults to plan=SCHOOL and reporter remains allowed', async () => {
    const org = await prisma.organization.create({
      data: { name: `Entitlements Test Org ${Date.now()}` },
    });
    expect(org.plan).toBe('SCHOOL');
    const e = getEntitlements(org);
    expect(e.plan).toBe('SCHOOL');
    expect(e.features.reporter).toBe(true);
  });
});

afterAll(async () => {
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

