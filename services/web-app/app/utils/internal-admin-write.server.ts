import { createHash } from 'node:crypto';

export const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });

export function requestHash(body: string) {
  return createHash('sha256').update(body).digest('hex');
}

export async function writeAuditRows(
  tx: any,
  args: {
    auth: { actorEmail: string; keyId: string };
    endpoint: string;
    hash: string;
    action: string;
    targetId: string;
    before: unknown;
    after: unknown;
    idempotencyKey?: string | null;
    reason?: string | null;
  }
) {
  await tx.internalPlatformApiAudit.createMany({
    data: [
      {
        actorEmail: args.auth.actorEmail,
        keyId: args.auth.keyId,
        endpoint: args.endpoint,
        requestHash: args.hash,
        result: 'before',
        action: `${args.action}.before`,
        targetId: args.targetId,
        metadata: {
          before: args.before,
          idempotencyKey: args.idempotencyKey ?? null,
          ...(args.reason !== undefined ? { reason: args.reason } : {}),
        },
      },
      {
        actorEmail: args.auth.actorEmail,
        keyId: args.auth.keyId,
        endpoint: args.endpoint,
        requestHash: args.hash,
        result: 'after',
        action: `${args.action}.after`,
        targetId: args.targetId,
        metadata: {
          after: args.after,
          idempotencyKey: args.idempotencyKey ?? null,
          ...(args.reason !== undefined ? { reason: args.reason } : {}),
        },
      },
    ],
  });
}
