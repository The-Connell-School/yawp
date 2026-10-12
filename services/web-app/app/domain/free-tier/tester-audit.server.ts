import type { Prisma } from '@app/prisma';

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
