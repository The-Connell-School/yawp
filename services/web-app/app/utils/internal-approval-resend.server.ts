import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { resendFreeTierAdminApprovalReminder } from '~/domain/free-tier/approval-flow.server';
import { prisma } from './db.server';
import { readBoundedText } from './bounded-body.server';
import { authorizeInternalApiRequest, INTERNAL_API_HEADER_SIGNATURE } from './internal-platform-auth.server';

const response = (body: unknown, status = 200) => Response.json(body, { status,
  headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const bodySchema = z.object({ reason: z.string().max(280).optional() }).strict();
const keySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/);
const timestamp = z.union([z.date(), z.string().datetime()]).transform(value => new Date(value).toISOString());
const acceptanceSchema = z.object({ ok: z.literal(true), sentAt: timestamp, reminderCount: z.number().int().min(1).max(4),
  toEmail: z.string().email(), nextAutoReminderAt: timestamp.nullable() });

export async function approvalResendHttp(request: Request, applicationId: string | undefined) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  if (!(await isFreeTierEnabled())) return response({ error: 'Not found' }, 404);
  if (!request.headers.get(INTERNAL_API_HEADER_SIGNATURE)) return response({ error: 'Unauthorized' }, 401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'Invalid content type' }, 400);
  const text = await readBoundedText(request, 4096);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  const auth = await authorizeInternalApiRequest(request, { body: text, requiredScope: 'management:write' });
  if (auth instanceof Response) return auth;
  if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);
  if (!applicationId || applicationId.length > 200 || new URL(request.url).search) return response({ error: 'Invalid request' }, 400);
  let body: z.infer<typeof bodySchema>;
  let idempotencyKey: string;
  try {
    body = bodySchema.parse(JSON.parse(text));
    idempotencyKey = keySchema.parse(request.headers.get('Idempotency-Key'));
  } catch { return response({ error: 'Invalid input' }, 400); }
  if (!(await prisma.freeTierApplication.findUnique({ where: { id: applicationId }, select: { id: true } })))
    return response({ error: 'Not found' }, 404);
  let result: { ok: boolean; reason?: string };
  try {
    result = await resendFreeTierAdminApprovalReminder({ applicationId, request,
      actorEmail: auth.actorEmail, idempotencyKey, requireV2: true });
  } catch {
    // The shared delivery owner handles uncertain acceptance. Do not retry or
    // expose provider diagnostics here; retain an attributable failure outcome.
    result = { ok: false, reason: 'email_failed' };
  }
  let error: string | null = null;
  let status = 200;
  const acceptance = acceptanceSchema.safeParse(result);
  if (!result.ok) {
    switch (result.reason) {
      case 'not_allowed': case 'already_decided': case 'rate_limited': case 'flag_off':
        error = result.reason; status = 409; break;
      case 'not_found': error = 'already_decided'; status = 409; break;
      case 'invalid': error = 'Invalid input'; status = 400; break;
      default: error = 'email_failed'; status = 502;
    }
  } else if (!acceptance.success) {
    // Never manufacture an acceptance from the legacy {ok:true} helper.
    error = 'email_failed'; status = 502;
  }
  await prisma.internalPlatformApiAudit.create({ data: {
    actorEmail: auth.actorEmail, actorUserId: `internal-api:${auth.keyId}`, keyId: auth.keyId,
    endpoint: `POST ${new URL(request.url).pathname}`, action: 'approval.resend', targetId: applicationId,
    requestHash: createHash('sha256').update(text).digest('hex'), result: error ?? 'success',
    metadata: { source: 'manual', reason: body.reason ?? null },
  } });
  return error ? response({ error }, status) : response(acceptance.data);
}
