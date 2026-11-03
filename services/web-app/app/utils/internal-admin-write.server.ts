import { createHash } from 'node:crypto';
import { z } from 'zod';

// Blank reasons are rejected after trimming; omission remains optional.
export const reasonSchema = z.string().trim().min(1).max(500).optional();

export const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });

export function requestHash(body: string | Uint8Array) {
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

/** Bound allocation before authentication; Content-Length is only an early hint. */
export async function readBoundedBody(request: Request, limit: number) {
  const tooLarge = () => response({ error: 'Request body too large' }, 413);
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared.trim()) && Number(declared) > limit) {
    void request.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}
