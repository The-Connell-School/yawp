import type { Prisma } from '@app/prisma';
import type { FreeTierUsageSummary } from './usage-budget.server';

export type TesterAuditActor = {
  actorUserId: string;
  actorEmail: string;
  environment: string;
  action: string;
};

// Called within the mutation transaction: an audit failure rolls back the change.
export async function recordTesterAudit(
  tx: Prisma.TransactionClient,
  actor: TesterAuditActor,
  targetId: string,
  metadata: Prisma.InputJsonObject = {}
) {
  await tx.internalPlatformApiAudit.create({
    data: {
      ...actor,
      targetId,
      metadata,
      keyId: 'platform-tester',
      endpoint: actor.action,
      requestHash: 'session-authenticated',
      result: 'changed',
    },
  });
}

export async function recordFreeTierCapDenialAudit(
  tx: Pick<Prisma.TransactionClient, 'internalPlatformApiAudit'>,
  actor: TesterAuditActor,
  targetId: string | null,
  metadata: Prisma.InputJsonObject & { budget?: FreeTierUsageSummary } = {}
) {
  await tx.internalPlatformApiAudit.create({
    data: {
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      action: actor.action,
      targetId,
      environment: actor.environment,
      metadata,
      keyId: 'free-tier-cap-guard',
      endpoint: actor.action,
      requestHash: 'cap-denial',
      result: 'denied',
    },
  });
}
