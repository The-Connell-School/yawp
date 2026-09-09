import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('QA accounts are scoped, idempotent, attributable and archived without deleting users', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Owned local DB required');
  process.env.DATABASE_URL = connection; process.env.E2E_DATABASE_URL = connection;
  const { basePrisma: db } = await import('./db.server');
  const { InternalQaAccounts } = await import('./internal-qa.server');
  const organization = await db.organization.findFirstOrThrow({ where: { memberships: { some: { user: { email: 'dev.teacher@yawp.local' } } } } });
  const service = new InternalQaAccounts(db);
  const request = { id: randomUUID(), actorId: 'qa-operator', organizationId: organization.id, reason: 'Verify QA account flow', users: [{ name: 'Teacher scenario', role: 'TEACHER' as const }, { name: 'Student scenario', role: 'STUDENT' as const }] };
  let fixture: Awaited<ReturnType<typeof service.create>> | undefined;
  try {
    const results = await Promise.all([service.create(request), service.create(request)]);
    fixture = results[0];
    expect(results[0]).toEqual(results[1]);
    expect(fixture.users).toHaveLength(2);
    expect(fixture.actorId).toBe(request.actorId);
    await expect(service.create({ ...request, reason: 'changed' })).rejects.toThrow('Idempotency');
    const users = await db.user.findMany({ where: { id: { in: fixture.users.map(user => user.userId) } }, include: { memberships: true, password: true } });
    expect(users).toHaveLength(2);
    expect(users.every(user => !user.isAdmin && !user.isSuperAdmin && !user.password && user.email.endsWith('@yawp.invalid'))).toBe(true);
    expect(users.every(user => user.memberships.length === 1 && user.memberships[0]!.organizationId === organization.id && !user.memberships[0]!.isOrgOwner)).toBe(true);
    await expect(service.archive({ id: fixture.id, organizationId: 'outside', actorId: 'qa-operator' })).rejects.toThrow();
    await expect(Promise.resolve(db.$executeRaw`UPDATE "InternalQaFixture" SET "actorId"='tampered' WHERE id=${fixture.id}`)).rejects.toThrow();
    await service.archive({ id: fixture.id, organizationId: organization.id, actorId: 'cleanup-operator' });
    const archived = await service.archive({ id: fixture.id, organizationId: organization.id, actorId: 'another-operator' });
    expect(archived.archivedBy).toBe('cleanup-operator');
    await expect(Promise.resolve(db.$executeRaw`DELETE FROM "InternalQaFixture" WHERE id=${fixture.id}`)).rejects.toThrow();
    await expect(Promise.resolve(db.$executeRaw`UPDATE "InternalQaFixture" SET "archivedAt"=NULL, "archivedBy"=NULL WHERE id=${fixture.id}`)).rejects.toThrow();
    const limited = await db.organization.create({ data: { name: 'QA capacity test', numOfTeacherSeats: 0, numOfStudentSeats: 0 } });
    try {
      const denied = { ...request, id: randomUUID(), organizationId: limited.id };
      await expect(service.create(denied)).rejects.toThrow('seat limit');
      expect(await db.internalQaFixture.count({ where: { id: denied.id } })).toBe(0);
      expect(await db.orgMembership.count({ where: { organizationId: limited.id } })).toBe(0);
    } finally { await db.organization.delete({ where: { id: limited.id } }); }

    expect(await db.orgMembership.count({ where: { id: { in: fixture.users.map(user => user.membershipId) }, isActive: true } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: fixture.users.map(user => user.userId) } } })).toBe(2);
  } finally {
    if (fixture) await service.archive({ id: fixture.id, organizationId: organization.id, actorId: 'cleanup-operator' });
    await db.$disconnect();
  }
}, 30000);
