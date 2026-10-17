import { beforeEach, afterEach, expect, mock, test } from 'bun:test';
const flags = { ...await import('~/domain/feature-flags/feature-flags.server') };
const enabled = mock(async () => true);
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ ...flags, isFreeTierEnabled: enabled }));
const flow = { ...await import('~/domain/free-tier/approval-flow.server') };
const accepted = { ok: true, sentAt: '2026-10-16T10:00:00.000Z', reminderCount: 3,
  toEmail: 'admin@example.test', nextAutoReminderAt: '2026-10-23T10:00:00.000Z' };
const resend = mock(async (_args: any): Promise<any> => accepted);
mock.module('~/domain/free-tier/approval-flow.server', () => ({ ...flow, resendFreeTierAdminApprovalReminder: resend }));
const db = { ...await import('~/utils/db.server') };
const audit = mock(async (_args: any) => ({}));
const findUnique = mock(async (_args: any): Promise<any> => ({ id: 'app' }));
mock.module('~/utils/db.server', () => ({ ...db, prisma: new Proxy(db.prisma, { get(target, key) {
  if (key === 'freeTierApplication') return { findUnique };
  if (key === 'internalPlatformApiAudit') return { create: audit };
  return Reflect.get(target, key);
} }) }));
const auth = await import('./internal-platform-auth.server');
const { loader, action } = await import('~/routes/api.internal.v1.free-tier.approval.$id.resend/route');
const saved = { ...process.env };
const secret = 'local-approval-test-secret-32-characters';
const url = 'https://yawp.test/api/internal/v1/free-tier/approval/app/resend';
function request(body: unknown = {}, extra: { key?: string | null; signedBody?: string; method?: string; raw?: string; url?: string } = {}) {
  const method = extra.method ?? 'POST'; const target = extra.url ?? url;
  const text = extra.raw ?? JSON.stringify(body);
  return new Request(target, { method, body: ['GET', 'HEAD'].includes(method) ? undefined : text, headers: {
    ...auth.signInternalApiRequest({ method, url: target, keyId: 'approval-test', secret,
      actor: 'Staff@Example.test', body: extra.signedBody ?? (method === 'GET' ? '' : text) }).headers,
    'content-type': 'application/json', ...(extra.key === null ? {} : { 'Idempotency-Key': extra.key ?? 'request-1' }),
  } });
}
const call = (req: Request) => (req.method === 'GET' ? loader : action)({ request: req, params: { id: 'app' } } as any);
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'approval-test', secret, scopes: ['management:read', 'management:write'] }]);
  process.env.INTERNAL_API_NONCE_STORE = 'memory'; process.env.YAWP_MANAGEMENT_SERVICE_KEY = 'b'.repeat(43);
  auth.resetInternalApiMemoryNonceStore(); auth.resetInternalApiRateLimitBuckets();
  enabled.mockReset().mockResolvedValue(true); resend.mockReset().mockResolvedValue(accepted);
  findUnique.mockReset().mockResolvedValue({ id: 'app' }); audit.mockClear();
});
afterEach(() => {
  for (const key of ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE', 'YAWP_MANAGEMENT_SERVICE_KEY']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
test('delegates durable acceptance, verified actor and v2-only requirement, audits outcome', async () => {
  const response = await call(request({ reason: 'Requested by staff' }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual(accepted);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(resend.mock.calls[0]![0]).toMatchObject({ applicationId: 'app', actorEmail: 'staff@example.test', idempotencyKey: 'request-1', requireV2: true });
  expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorEmail: 'staff@example.test', keyId: 'approval-test', result: 'success' }) });
});
for (const [reason, status, error] of [
  ['not_allowed', 409, 'not_allowed'], ['already_decided', 409, 'already_decided'], ['rate_limited', 409, 'rate_limited'],
  ['flag_off', 409, 'flag_off'], ['email_failed', 502, 'email_failed'], ['invalid', 400, 'Invalid input'],
  ['not_found', 409, 'already_decided'],
] as const) test(`maps ${reason} and redacts diagnostics`, async () => {
  resend.mockResolvedValue({ ok: false, reason, error: 'secret provider detail' });
  const response = await call(request()); expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error }); expect(audit.mock.calls[0]![0].data.result).toBe(error);
});
test('retries delegate to shared immutable acceptance; reused signed nonce is denied', async () => {
  expect(await (await call(request())).json()).toEqual(accepted);
  expect(await (await call(request())).json()).toEqual(accepted); expect(resend).toHaveBeenCalledTimes(2);
  const original = request(); const copy = original.clone();
  expect((await call(original)).status).toBe(200); expect((await call(copy)).status).toBe(401);
  expect(resend).toHaveBeenCalledTimes(3);
});
test('strict input rejects missing/invalid keys, oversized reasons and forged identity', async () => {
  for (const key of [null, '', 'bad key', 'x'.repeat(201)]) expect((await call(request({}, { key }))).status).toBe(400);
  for (const body of [null, [], { reason: null }, { reason: 1 }, { reason: 'x'.repeat(281) }, { actorEmail: 'forged@example.test' }])
    expect((await call(request(body))).status).toBe(400);
  expect(resend).not.toHaveBeenCalled(); expect((await call(request({ reason: 'x'.repeat(280) }))).status).toBe(200);
});
test('rejects malformed, oversized, wrong method and missing application requests', async () => {
  expect((await call(request({}, { raw: '{' }))).status).toBe(400);
  expect((await call(request({}, { url: url + '?anything=1' }))).status).toBe(400);
  const badType = request(); badType.headers.set('content-type', 'text/plain'); expect((await call(badType)).status).toBe(400);
  expect((await call(request({}, { raw: 'x'.repeat(4097) }))).status).toBe(413);
  expect((await call(request({}, { method: 'GET' }))).status).toBe(405);
  expect((await call(request({}, { method: 'PUT' }))).status).toBe(405);
  expect(resend).not.toHaveBeenCalled(); findUnique.mockResolvedValue(null); expect((await call(request())).status).toBe(404);
});
test('requires HMAC, write scope, signed actor/body and free tier access', async () => {
  expect((await call(new Request(url, { method: 'POST', body: '{}', headers: { authorization: `Bearer ${'b'.repeat(43)}` } }))).status).toBe(401);
  const invalid = request(); invalid.headers.set(auth.INTERNAL_API_HEADER_SIGNATURE, 'invalid'); expect((await call(invalid)).status).toBe(401);
  expect((await call(request({}, { signedBody: '{"reason":"other"}' }))).status).toBe(401);
  const actor = request(); actor.headers.set(auth.INTERNAL_API_HEADER_ACTOR, 'forged@example.test'); expect((await call(actor)).status).toBe(401);
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'approval-test', secret, scopes: ['management:read'] }]);
  expect((await call(request())).status).toBe(403); enabled.mockResolvedValue(false); expect((await call(request())).status).toBe(404);
  expect(resend).not.toHaveBeenCalled();
});
test('shared Date-valued acceptance is serialized to UTC ISO and extra payload is stripped', async () => {
  resend.mockResolvedValue({ ...accepted, sentAt: new Date(accepted.sentAt), nextAutoReminderAt: new Date(accepted.nextAutoReminderAt), payload: 'secret' });
  expect(await (await call(request())).json()).toEqual(accepted);
});
test('legacy success without durable acceptance fails closed and exposes no invented result', async () => {
  resend.mockResolvedValue({ ok: true });
  const response = await call(request()); expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'email_failed' });
});
test('expired signed resend requests are denied without delivery', async () => {
  const req = request(); req.headers.set(auth.INTERNAL_API_HEADER_TIMESTAMP, String(Math.floor(Date.now() / 1000) - 600));
  expect((await call(req)).status).toBe(401); expect(resend).not.toHaveBeenCalled();
});

test('uncertain thrown delivery outcomes are audited and redacted without a retry', async () => {
  resend.mockRejectedValue(new Error('secret provider detail'));
  const response = await call(request()); expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'email_failed' });
  expect(resend).toHaveBeenCalledTimes(1);
  expect(audit.mock.calls[0]![0].data.result).toBe('email_failed');
});
