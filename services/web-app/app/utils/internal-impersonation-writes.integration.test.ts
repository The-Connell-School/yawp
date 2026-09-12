import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('attributed database writes and audit commit or roll back together without leaking pooled context', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Local fixture database required');
  process.env.DATABASE_URL = connection;
  process.env.E2E_DATABASE_URL = connection;
  const { basePrisma: prisma } = await import('./db.server');
  const uncovered = await prisma.$queryRaw<Array<{name:string}>>`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND c.relkind='r'
    AND c.relname NOT IN ('_prisma_migrations','InternalImpersonationSession','InternalImpersonationEvent')
    AND (NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='internal_impersonation_mutation_audit' AND t.tgfoid=to_regprocedure('internal_impersonation_mutation_audit()') AND t.tgtype=29 AND t.tgenabled IN ('O','A'))
      OR NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='internal_impersonation_truncate_guard' AND t.tgfoid=to_regprocedure('internal_impersonation_truncate_guard()') AND t.tgtype=34 AND t.tgenabled IN ('O','A')))
    ORDER BY c.relname`;
  expect(uncovered).toEqual([]);
  const { InternalImpersonationSessions } = await import('./internal-impersonation-sessions.server');
  const { withImpersonationTransaction } = await import('./internal-impersonation-writes.server');
  const { createAttributedPrisma, runWithImpersonation } = await import('./internal-impersonation-context.server');
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: 'dev.teacher@yawp.local' }, include: { memberships: true } });
  const membership = teacher.memberships.find(m => m.isActive)!;
  const identity = { id: randomUUID(), actorId: `integration-${randomUUID()}`, userId: teacher.id, organizationId: membership.organizationId, expiresAt: new Date(Date.now() + 60000).toISOString() };
  const service = new InternalImpersonationSessions(prisma, { redeem: async () => identity, context: async () => identity, end: async () => {} });
  const created = await service.start(randomBytes(32).toString('base64url'));
  const context = { ...identity, membershipId: membership.id };
  const prefix = `audit-${randomUUID()}`;
  const requestId = randomUUID();
  try {
    await withImpersonationTransaction(prisma, context, { requestId, action: 'test.settings.create' }, async tx => {
      await tx.setting.createMany({ data: [
        { name: `${prefix}-a`, value: 'sensitive value one' },
        { name: `${prefix}-b`, value: 'sensitive value two' },
      ] });
      await tx.setting.updateMany({ where: { name: { startsWith: prefix } }, data: { value: 'changed sensitive value' } });
    });
    const events = await prisma.internalImpersonationEvent.findMany({ where: { sessionId: identity.id, requestId } });
    expect(events).toHaveLength(4);
    expect(events.every(e => e.actorId === identity.actorId && e.userId === teacher.id && e.organizationId === membership.organizationId)).toBe(true);
    expect(events.every(e => e.resourceType === 'Setting' && e.requestAction === 'test.settings.create')).toBe(true);
    expect(events.filter(e => e.action === 'row.updated')).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain('sensitive value');
    expect(events.every(e => typeof JSON.parse(e.resourceId).id === 'string')).toBe(true);
    await expect(withImpersonationTransaction(prisma, context, { requestId: randomUUID(), action: 'test.truncate' }, async tx => {
      await tx.$executeRaw`TRUNCATE TABLE "Setting"`;
    })).rejects.toThrow();
    expect(await prisma.setting.count({ where: { name: { startsWith: prefix } } })).toBe(2);
    await prisma.$executeRaw`CREATE TABLE "InternalAuditCoverageFixture" (id TEXT PRIMARY KEY)`;
    try {
      await expect(withImpersonationTransaction(prisma, context, { requestId: randomUUID(), action: 'test.coverage' }, async () => {})).rejects.toThrow('Impersonation audit coverage is incomplete');
    } finally { await prisma.$executeRaw`DROP TABLE "InternalAuditCoverageFixture"`; }

    const rollbackId = randomUUID();
    await expect(withImpersonationTransaction(prisma, context, { requestId: rollbackId, action: 'test.rollback' }, async tx => {
      await tx.setting.deleteMany({ where: { name: { startsWith: prefix } } });
      throw new Error('rollback requested');
    })).rejects.toThrow('rollback requested');
    expect(await prisma.setting.count({ where: { name: { startsWith: prefix } } })).toBe(2);
    expect(await prisma.internalImpersonationEvent.count({ where: { requestId: rollbackId } })).toBe(0);

    // A regular write on a pooled connection must not inherit impersonation.
    await prisma.setting.create({ data: { name: `${prefix}-regular`, value: 'ordinary' } });
    expect(await prisma.internalImpersonationEvent.count({ where: { sessionId: identity.id, requestId } })).toBe(4);
    const jobId = randomUUID();
    await withImpersonationTransaction(prisma, context, { requestId: randomUUID(), action: 'test.job', jobId }, async tx => {
      await tx.setting.deleteMany({ where: { name: { startsWith: prefix } } });
    });
    expect(await prisma.internalImpersonationEvent.count({ where: { sessionId: identity.id, jobId, action: 'row.deleted' } })).toBe(3);
    const wrapped = createAttributedPrisma(prisma);
    const cachedSettings = wrapped.setting;
    const cachedTransaction = wrapped.$transaction;
    const wrappedRequest = randomUUID();
    let authorizeTail = true;
    let rechecks = 0;
    let releaseTail!: () => void;
    let tail!: Promise<unknown>;
    let transactionFromScope!: typeof wrapped.$transaction;
    let rawFromScope!: typeof wrapped.$executeRaw;
    await runWithImpersonation(context, { requestId: wrappedRequest, action: 'test.proxy' }, async () => {
      rechecks++;
      if (!authorizeTail) throw new Error('tail revoked');
      return context;
    }, async () => {
      transactionFromScope = wrapped.$transaction;
      rawFromScope = wrapped.$executeRaw;
      await cachedTransaction([
        cachedSettings.create({ data: { name: `${prefix}-array-a`, value: 'one' } }),
        wrapped.setting.create({ data: { name: `${prefix}-array-b`, value: 'two' } }),
      ]);
      await expect(wrapped.$transaction(async tx => {
        await tx.setting.updateMany({ where: { name: { startsWith: prefix } }, data: { value: 'should roll back' } });
        throw new Error('transaction rollback');
      })).rejects.toThrow('transaction rollback');
      await wrapped.$transaction(async () => {
        tail = new Promise<void>(resolve => { releaseTail = resolve; }).then(() => wrapped.setting.create({ data: { name: `${prefix}-tail`, value: 'must not run' } }));
      });
    });
    expect(await prisma.internalImpersonationEvent.count({ where: { sessionId: identity.id, requestId: wrappedRequest } })).toBe(2);
    expect((await prisma.setting.findUniqueOrThrow({ where: { name: `${prefix}-array-a` } })).value).toBe('one');
    await transactionFromScope([wrapped.setting.create({ data: { name: `${prefix}-outside`, value: 'ordinary' } })]);
    await rawFromScope`UPDATE "Setting" SET "value" = 'ordinary raw update' WHERE "name" = ${`${prefix}-outside`}`;
    expect(await prisma.internalImpersonationEvent.count({ where: { requestId: wrappedRequest } })).toBe(2);
    authorizeTail = false;
    releaseTail();
    await expect(tail).rejects.toThrow('tail revoked');
    expect(rechecks).toBe(1);
    expect(await prisma.setting.count({ where: { name: `${prefix}-tail` } })).toBe(0);
    const delayedRequest = randomUUID();
    let releaseAllowed!: () => void;
    let allowedTail!: Promise<unknown>;
    let allowedChecks = 0;
    await runWithImpersonation(context, { requestId: delayedRequest, action: 'test.delayed' }, async () => {
      allowedChecks++;
      return context;
    }, async () => {
      await wrapped.$transaction(async () => {
        allowedTail = new Promise<void>(resolve => { releaseAllowed = resolve; }).then(() =>
          cachedSettings.create({ data: { name: `${prefix}-allowed-tail`, value: 'attributed after response' } }));
      });
    });
    expect(await prisma.setting.count({ where: { name: `${prefix}-allowed-tail` } })).toBe(0);
    releaseAllowed();
    await allowedTail;
    expect(allowedChecks).toBe(1);
    const delayedEvents = await prisma.internalImpersonationEvent.findMany({ where: { sessionId: identity.id, requestId: delayedRequest } });
    expect(delayedEvents).toHaveLength(1);
    expect(delayedEvents[0]).toMatchObject({ actorId: context.actorId, userId: context.userId, organizationId: context.organizationId,
      requestAction: 'test.delayed', jobId: `tail-${delayedRequest}`, action: 'row.created', resourceType: 'Setting' });

    const { truncateAllPublicTables } = await import('../../../../packages/prisma/scripts/local-dev/truncate-all');
    const { cleanupDb } = await import('../../e2e/seed-e2e');
    for (const reset of [truncateAllPublicTables, cleanupDb]) {
    await expect(prisma.$transaction(async tx => {
      await reset(tx);
      expect(await tx.internalImpersonationEvent.count({ where: { sessionId: identity.id } })).toBeGreaterThan(0);
      expect(await tx.internalImpersonationSession.count({ where: { id: identity.id } })).toBe(1);
      throw new Error('restore fixture after seed reset proof');
    })).rejects.toThrow('restore fixture after seed reset proof');
    }
    await service.end(created.cookieToken);
    await expect(withImpersonationTransaction(prisma, context, { requestId: randomUUID(), action: 'test.after-exit' }, async tx => {
      await tx.setting.create({ data: { name: `${prefix}-after`, value: 'blocked' } });
    })).rejects.toThrow();
    expect(await prisma.setting.count({ where: { name: `${prefix}-after` } })).toBe(0);
  } finally {
    await prisma.setting.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.internalImpersonationSession.deleteMany({ where: { id: identity.id } });
    await prisma.$disconnect();
  }
}, 30000);
