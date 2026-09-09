import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('scenario receipts survive retries; reset replaces only owned active classroom data', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Owned local DB required');
  process.env.DATABASE_URL = connection; process.env.E2E_DATABASE_URL = connection;
  const { basePrisma: db } = await import('./db.server');
  const { InternalScenarios } = await import('./internal-scenario.server');
  const suffix = randomUUID();
  const org = await db.organization.create({ data: { name: `Scenario test ${suffix}`, numOfTeacherSeats: 10, numOfStudentSeats: 20 } });
  const school = await db.school.create({ data: { name: 'Unrelated school', code: suffix, organizationId: org.id } });
  const unrelated = await db.class.create({ data: { title: 'Unrelated class', code: 'keep', schoolId: school.id } });
  const binding = { environment: 'demo' as const, targetId: `demo-${suffix}`, organizationId: org.id };
  const service = new InternalScenarios(db, binding);
  const input = { jobId: randomUUID(), actorId: 'operator', fingerprint: 'a'.repeat(64), mode: 'populate' as const,
    target: { id: binding.targetId, environment: 'demo' as const, organizationId: org.id },
    recipe: { teachers: 2, students: 4, classes: 2, assignmentsPerClass: 2, submissions: 'mixed' as const } };
  try {
    const receipts = await Promise.all([service.apply(input), service.apply(input)]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(receipts[0]).toMatchObject({ jobId: input.jobId, targetId: binding.targetId, fingerprint: input.fingerprint, counts: { users: 6, classes: 2, assignments: 4, submissions: 8 } });
    expect(await db.orgMembership.count({ where: { organizationId: org.id, isActive: true } })).toBe(6);
    const members = await db.orgMembership.findMany({ where: { organizationId: org.id }, include: { user: { include: { password: true } } } });
    expect(members.every(m => !m.isOrgOwner && !m.user.isAdmin && !m.user.isSuperAdmin && !m.user.password)).toBe(true);
    await expect(service.apply({ ...input, actorId: 'changed' })).rejects.toThrow('Idempotency');
    await expect(service.apply({ ...input, jobId: randomUUID(), target: { ...input.target, organizationId: 'outside' } })).rejects.toThrow('Target');
    await expect(service.apply({ ...input, jobId: randomUUID(), target: { ...input.target, environment: 'production' as 'demo' } })).rejects.toThrow();
    expect(await db.class.count({ where: { school: { organizationId: org.id }, isArchived: false } })).toBe(3);
    const reset = await service.apply({ ...input, jobId: randomUUID(), mode: 'reset', recipe: { ...input.recipe, teachers: 1, students: 2, classes: 1, assignmentsPerClass: 1, submissions: 'draft' } });
    expect(reset.counts).toEqual({ users: 3, classes: 1, assignments: 1, submissions: 0 });
    expect(await db.class.count({ where: { school: { organizationId: org.id }, isArchived: false } })).toBe(2);
    expect((await db.class.findUniqueOrThrow({ where: { id: unrelated.id } })).isArchived).toBe(false);
    expect(await db.orgMembership.count({ where: { organizationId: org.id, isActive: true } })).toBe(3);
    expect(await db.orgMembership.count({ where: { id: { in: members.map(m => m.id) }, isActive: true } })).toBe(0);
    expect(await service.apply(input)).toEqual(receipts[0]);
    expect(await db.orgMembership.count({ where: { organizationId: org.id, isActive: true } })).toBe(3);
    const before = await db.user.count();
    await expect(service.apply({ ...input, jobId: randomUUID(), recipe: { ...input.recipe, students: 21 } })).rejects.toThrow('seat limit');
    expect(await db.user.count()).toBe(before);
  } finally { await db.$disconnect(); }
}, 60000);
