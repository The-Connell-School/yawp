import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('attributed sessions persist no bearer secret and enforce remote/local revocation', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Local fixture database required');
  process.env.DATABASE_URL = connection;
  process.env.E2E_DATABASE_URL = connection;
  const { prisma } = await import('./db.server');
  const { InternalImpersonationSessions } = await import('./internal-impersonation-sessions.server');
  const { InactiveImpersonationError } = await import('./internal-impersonation-client.server');
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: 'dev.teacher@yawp.local' }, include: { memberships: true } });
  const membership = teacher.memberships.find(value => value.isActive)!;
  const identity = { id: randomUUID(), actorId: `integration-${randomUUID()}`, userId: teacher.id, organizationId: membership.organizationId, expiresAt: new Date(Date.now() + 60000).toISOString() };
  let active = true;
  let unavailable = false;
  let reads = 0;
  const remote = {
    redeem: async (_token: string) => identity,
    context: async (_id: string) => { reads++; if (unavailable) throw new Error('unavailable'); if (!active) throw new InactiveImpersonationError(); return identity; },
    end: async (_id: string) => { if (unavailable) throw new Error('unavailable'); active = false; },
  };
  const service = new InternalImpersonationSessions(prisma, remote);
  const linkToken = randomBytes(32).toString('base64url');
  try {
    const created = await service.start(linkToken);
    expect(created.cookieToken).not.toBe(linkToken);
    expect(created.identity).toEqual(identity);
    const stored = await prisma.internalImpersonationSession.findUniqueOrThrow({ where: { id: identity.id } });
    expect(stored.actorId).toBe(identity.actorId);
    expect(stored.userId).toBe(teacher.id);
    expect(stored.membershipId).toBe(membership.id);
    expect(JSON.stringify(stored)).not.toContain(linkToken);
    expect(JSON.stringify(stored)).not.toContain(created.cookieToken);
    expect(await prisma.internalImpersonationEvent.count({ where: { sessionId: identity.id, action: 'session.started' } })).toBe(1);
    expect((await service.resolve(created.cookieToken)).actorId).toBe(identity.actorId);
    expect((await service.resolve(created.cookieToken)).userId).toBe(teacher.id);
    expect(reads).toBe(2);
    active = false;
    await expect(service.resolve(created.cookieToken)).rejects.toThrow('Impersonation is inactive');
    active = true;
    unavailable = true;
    await expect(service.resolve(created.cookieToken)).rejects.toThrow('unavailable');
    await service.end(created.cookieToken);
    await expect(service.resolve(created.cookieToken)).rejects.toThrow('Impersonation is inactive');
    expect((await prisma.internalImpersonationSession.findUniqueOrThrow({ where: { id: identity.id } })).remoteEndPending).toBe(true);
    await service.end(created.cookieToken);
    expect(await prisma.internalImpersonationEvent.count({ where: { sessionId: identity.id, action: 'session.ended' } })).toBe(1);
    unavailable = false;
    await service.flushPendingEnds();
    expect((await prisma.internalImpersonationSession.findUniqueOrThrow({ where: { id: identity.id } })).remoteEndPending).toBe(false);
    expect(active).toBe(false);
  } finally {
    await prisma.internalImpersonationEvent.deleteMany({ where: { sessionId: identity.id } });
    await prisma.internalImpersonationSession.deleteMany({ where: { id: identity.id } });
    await prisma.$disconnect();
  }
}, 30000);

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('ineligible targets create neither a local session nor a start audit', async () => {
  const { prisma } = await import('./db.server');
  const { InternalImpersonationSessions } = await import('./internal-impersonation-sessions.server');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'dev.teacher@yawp.local' } });
  const identity = { id: randomUUID(), actorId: 'integration-actor', userId: user.id, organizationId: 'wrong-organization', expiresAt: new Date(Date.now() + 60000).toISOString() };
  let ended = false;
  const service = new InternalImpersonationSessions(prisma, {
    redeem: async () => identity, context: async () => identity, end: async () => { ended = true; },
  });
  try {
    await expect(service.start(randomBytes(32).toString('base64url'))).rejects.toThrow('Impersonation is inactive');
    expect(ended).toBe(true);
    expect(await prisma.internalImpersonationSession.count({ where: { id: identity.id } })).toBe(0);
    expect(await prisma.internalImpersonationEvent.count({ where: { sessionId: identity.id } })).toBe(0);
  } finally { await prisma.$disconnect(); }
}, 30000);
