import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@app/prisma';
import {
  InactiveImpersonationError, type InternalImpersonationIdentity, type InternalImpersonationClient,
} from './internal-impersonation-client.server';

type Client = Pick<InternalImpersonationClient, 'redeem' | 'context' | 'end'>;
type Database = InstanceType<typeof PrismaClient>;
type Attribution = { id: string; actorId: string; userId: string; organizationId: string };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
const event = (identity: Attribution, action: string) => ({
  sessionId: identity.id, actorId: identity.actorId, userId: identity.userId,
  organizationId: identity.organizationId, action,
  resourceType: 'InternalImpersonationSession', resourceId: identity.id,
});

/** Session lifecycle only. HTTP authentication must not activate until request auditing is wired. */
export class InternalImpersonationSessions {
  constructor(private db: Database, private remote: Client) {}
  private async eligible(tx: Prisma.TransactionClient, identity: InternalImpersonationIdentity) {
    const membership = await tx.orgMembership.findUnique({
      where: { userId_organizationId: { userId: identity.userId, organizationId: identity.organizationId } },
      select: { id: true, isActive: true, user: { select: { isAdmin: true, isSuperAdmin: true } } },
    });
    if (!membership?.isActive || membership.user.isAdmin || membership.user.isSuperAdmin) throw new InactiveImpersonationError();
    return membership;
  }
  async start(token: string) {
    if (!validToken(token)) throw new InactiveImpersonationError();
    const identity = await this.remote.redeem(token);
    const cookieToken = randomBytes(32).toString('base64url');
    try {
      await this.db.$transaction(async tx => {
        if (Date.parse(identity.expiresAt) <= Date.now()) throw new InactiveImpersonationError();
        const membership = await this.eligible(tx, identity);
        await tx.internalImpersonationSession.create({ data: {
          ...identity, expiresAt: new Date(identity.expiresAt), membershipId: membership.id,
          cookieTokenHash: hash(cookieToken),
        } });
        await tx.internalImpersonationEvent.create({ data: event(identity, 'session.started') });
      });
    } catch (error) {
      // Link is consumed. Do not retry it or create an ordinary user session.
      try { await this.remote.end(identity.id); } catch { /* upstream lifetime still bounds access */ }
      throw error;
    }
    return { cookieToken, identity };
  }
  async resolve(cookieToken: string) {
    if (!validToken(cookieToken)) throw new InactiveImpersonationError();
    const stored = await this.db.internalImpersonationSession.findUnique({ where: { cookieTokenHash: hash(cookieToken) } });
    if (!stored || stored.endedAt || stored.expiresAt.getTime() <= Date.now()) throw new InactiveImpersonationError();
    const current = await this.remote.context(stored.id);
    if (current.id !== stored.id || current.actorId !== stored.actorId || current.userId !== stored.userId
      || current.organizationId !== stored.organizationId || Date.parse(current.expiresAt) !== stored.expiresAt.getTime()) {
      throw new InactiveImpersonationError();
    }
    return this.db.$transaction(async tx => {
      const alive = await tx.internalImpersonationSession.findFirst({ where: { id: stored.id, endedAt: null, expiresAt: { gt: new Date() } } });
      if (!alive) throw new InactiveImpersonationError();
      const membership = await this.eligible(tx, current);
      if (membership.id !== stored.membershipId) throw new InactiveImpersonationError();
      return { ...current, membershipId: membership.id };
    });
  }
  async end(cookieToken: string) {
    if (!validToken(cookieToken)) return;
    const id = await this.db.$transaction(async tx => {
      const session = await tx.internalImpersonationSession.findUnique({ where: { cookieTokenHash: hash(cookieToken) } });
      if (!session) return null;
      const ended = await tx.internalImpersonationSession.updateMany({
        where: { id: session.id, endedAt: null }, data: { endedAt: new Date(), remoteEndPending: true },
      });
      if (ended.count) await tx.internalImpersonationEvent.create({ data: event(session, 'session.ended') });
      return session.id;
    });
    if (id) await this.finishRemoteEnd(id);
  }
  private async finishRemoteEnd(id: string) {
    try { await this.remote.end(id); }
    catch (error) { if (!(error instanceof InactiveImpersonationError)) return; }
    await this.db.internalImpersonationSession.updateMany({ where: { id, endedAt: { not: null } }, data: { remoteEndPending: false } });
  }
  async flushPendingEnds() {
    const pending = await this.db.internalImpersonationSession.findMany({
      where: { remoteEndPending: true }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 20,
    });
    for (const session of pending) await this.finishRemoteEnd(session.id);
  }
}
