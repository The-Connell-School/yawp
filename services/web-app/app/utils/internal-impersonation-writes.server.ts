import type { Prisma, PrismaClient } from '@app/prisma';
import type { InternalImpersonationIdentity } from './internal-impersonation-client.server';
import { InactiveImpersonationError } from './internal-impersonation-client.server';

export type ImpersonationAttribution = InternalImpersonationIdentity & { membershipId: string };
export type ImpersonationOperation = { requestId: string; action: string; jobId?: string };

/** Call only after remote authorization. Settings are transaction-local, never connection-global. */
export async function withImpersonationTransaction<T>(
  db: InstanceType<typeof PrismaClient>,
  identity: ImpersonationAttribution,
  operation: ImpersonationOperation,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: string; timeout?: number; maxWait?: number; auditCoverage?: boolean },
): Promise<T> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(operation.requestId)
    || !/^[a-zA-Z0-9_.:/ -]{1,200}$/.test(operation.action)
    || (operation.jobId !== undefined && !/^[a-zA-Z0-9_-]{1,200}$/.test(operation.jobId))) {
    throw new Error('Invalid impersonation operation');
  }
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "InternalImpersonationSession"
      WHERE "id" = ${identity.id} AND "actorId" = ${identity.actorId}
        AND "userId" = ${identity.userId} AND "organizationId" = ${identity.organizationId}
        AND "membershipId" = ${identity.membershipId}
        AND "expiresAt" = ${new Date(identity.expiresAt)}
        AND "endedAt" IS NULL AND "expiresAt" > clock_timestamp()
      FOR SHARE`;
    if (rows.length !== 1) throw new InactiveImpersonationError();
    const member = await tx.orgMembership.findFirst({ where: {
      id: identity.membershipId, userId: identity.userId, organizationId: identity.organizationId,
      isActive: true, user: { isAdmin: false, isSuperAdmin: false },
    }, select: { id: true } });
    if (!member) throw new InactiveImpersonationError();
    if (options?.auditCoverage !== false) {
      // A new table introduced by a later migration must not silently evade audit.
      const uncovered = await tx.$queryRaw<Array<{ name: string }>>`
        SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema() AND c.relkind = 'r'
          AND c.relname NOT IN ('_prisma_migrations', 'InternalImpersonationSession', 'InternalImpersonationEvent')
          AND (NOT EXISTS (SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = c.oid AND t.tgname = 'internal_impersonation_mutation_audit'
              AND t.tgfoid = to_regprocedure('internal_impersonation_mutation_audit()')
              AND t.tgtype = 29 AND t.tgenabled IN ('O', 'A'))
            OR NOT EXISTS (SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = c.oid AND t.tgname = 'internal_impersonation_truncate_guard'
                AND t.tgfoid = to_regprocedure('internal_impersonation_truncate_guard()')
                AND t.tgtype = 34 AND t.tgenabled IN ('O', 'A')))`;
      if (uncovered.length) throw new Error('Impersonation audit coverage is incomplete');
    }
    await tx.$queryRaw`SELECT
      set_config('yawp.impersonation.session', ${identity.id}, true),
      set_config('yawp.impersonation.request', ${operation.requestId}, true),
      set_config('yawp.impersonation.action', ${operation.action}, true),
      set_config('yawp.impersonation.job', ${operation.jobId ?? ''}, true)`;
    return work(tx);
  }, {
    timeout: options?.timeout ?? 60000, maxWait: options?.maxWait ?? 10000,
    ...(options?.isolationLevel ? { isolationLevel: options.isolationLevel as Prisma.TransactionIsolationLevel } : {}),
  });
}
