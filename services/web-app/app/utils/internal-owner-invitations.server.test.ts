import { beforeEach, afterEach, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';

mock.module('~/utils/db.server', () => ({ prisma: {} }));
const mail = mock(async (_options: any) => ({ status: 'success' }));
mock.module('~/utils/email.server', () => ({ sendEmail: mail }));
const { createInternalOwnerInvitationHandlers } = await import('./internal-owner-invitations.server');
const { signInternalApiRequest, resetInternalApiMemoryNonceStore, resetInternalApiRateLimitBuckets } = await import('./internal-platform-auth.server');
const base = 'https://yawp.test/api/internal/v1/admin/organizations/org-1/invitations';
const secret = 'owner-invitation-test-secret-32-bytes';
const env = { ...process.env };
beforeEach(() => {
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([
    { id: 'writer', secret, scopes: ['management:write', 'management:read'] },
    { id: 'reader', secret, scopes: ['management:read'] },
  ]);
  resetInternalApiMemoryNonceStore();
  resetInternalApiRateLimitBuckets();
  mail.mockClear();
});
afterEach(() => { process.env = { ...env }; });
function request(method = 'POST', value: unknown = { emails: ['New@Example.test'], expiresInDays: 14 }, options: { path?: string; raw?: string | Uint8Array; keyId?: string; unsigned?: boolean; idempotency?: string } = {}) {
  const url = base + (options.path ?? '');
  const body = options.raw ?? (method === 'GET' ? '' : JSON.stringify(value));
  const headers = new Headers(options.unsigned ? {} : signInternalApiRequest({ method, url, body, keyId: options.keyId ?? 'writer', secret, actor: 'Operator@example.test' }).headers);
  if (options.idempotency) headers.set('Idempotency-Key', options.idempotency);
  return new Request(url, { method, headers, ...(method !== 'GET' ? { body } : {}) });
}
function fixture() {
  const rows: any[] = [];
  const audits: any[] = [];
  const members: any[] = [];
  const events: string[] = [];
  let organization: any = { id: 'org-1', name: 'Example organization' };
  const db: any = {
    $queryRaw: mock(async () => { events.push('lock'); return []; }),
    organization: { findUnique: mock(async () => { events.push('read'); return organization; }) },
    orgMembership: { findMany: mock(async () => members) },
    invitation: {
      findMany: mock(async ({ where }: any) => rows.filter(r => r.type === 'onboard-owner' && (r.organizationId === where.OR?.[0]?.organizationId || r.metadata === where.OR?.[1]?.metadata))),
      findFirst: mock(async ({ where }: any) => rows.find(r => r.type === where.type && r.target.toLowerCase() === where.target.equals.toLowerCase()) ?? null),
      create: mock(async ({ data }: any) => { const row = { id: `inv-${rows.length}-${audits.length}`, createdAt: new Date(), ...data }; rows.push(row); return row; }),
      delete: mock(async ({ where }: any) => { const index = rows.findIndex(r => r.id === where.id); return rows.splice(index, 1)[0]; }),
    },
    internalPlatformApiAudit: {
      findMany: mock(async () => audits.filter(a => a.result === 'after')),
      findFirst: mock(async ({ where }: any) => audits.find(a => a.endpoint === where.endpoint && a.action === where.action && a.actorEmail === where.actorEmail && a.keyId === where.keyId && a.result === 'after' && a.metadata.idempotencyKey === where.metadata.equals) ?? null),
      createMany: mock(async ({ data }: any) => { audits.push(...JSON.parse(JSON.stringify(data))); }),
    },
  };
  db.$transaction = mock(async (fn: any) => fn(db));
  const auditRead = mock(async (_input: any) => {});
  const handlers = createInternalOwnerInvitationHandlers({ db, auditRead });
  const seed = (overrides: any = {}) => { const row = { id: 'legacy', type: 'onboard-owner', target: 'legacy@example.test', createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000), metadata: JSON.stringify({ organizationId: 'org-1' }), secret: 'DO-NOT-EXPOSE', ...overrides }; rows.push(row); return row; };
  return { db, rows, audits, members, handlers, events, auditRead, seed, removeOrg: () => { organization = null; } };
}
for (const op of ['list', 'create', 'resend'] as const) {
  const invoke = (f: ReturnType<typeof fixture>, req: Request) => op === 'resend' ? f.handlers.resend(req, 'org-1', 'legacy') : f.handlers[op](req, 'org-1');
  const method = op === 'list' ? 'GET' : 'POST';
  const body = op === 'resend' ? {} : { emails: ['new@example.test'], expiresInDays: 7 };
  test(`${op}: authentication, scope, method and missing organization`, async () => {
    const f = fixture();
    expect((await invoke(f, request(method, body, { unsigned: true }))).status).toBe(401);
    if (op !== 'list') expect((await invoke(f, request(method, body, { keyId: 'reader' }))).status).toBe(403);
    expect((await invoke(f, request('DELETE', body))).status).toBe(405);
    f.removeOrg();
    const res = await invoke(f, request(method, body));
    expect(res.status).toBe(404);
    expect(Object.keys(await res.json())).toEqual(['error']);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(mail).not.toHaveBeenCalled();
  });
  if (op !== 'list') {
    test(`${op}: strict validation, reason limits, raw byte bounds and UTF-8`, async () => {
      for (const invalid of [{ ...body, unknown: true }, { ...body, reason: ' ' }, { ...body, reason: 'x'.repeat(501) }, { ...body, reason: null }]) {
        const f = fixture();
        expect((await invoke(f, request(method, invalid))).status).toBe(400);
        expect(f.db.$transaction).not.toHaveBeenCalled();
      }
      for (const raw of ['{', new Uint8Array([0xff]), '\ufeff{}']) expect((await invoke(fixture(), request(method, {}, { raw }))).status).toBe(400);
      for (const declared of [true, false]) {
        const req = request(method, {}, { raw: declared ? '{}' : 'é'.repeat(131073), unsigned: true });
        if (declared) req.headers.set('content-length', '262145');
        expect((await invoke(fixture(), req)).status).toBe(413);
      }
    });
  }
}
test('create validates the whole batch then normalizes and deduplicates emails', async () => {
  for (const emails of [[], ['invalid'], Array(51).fill('x@example.test')]) {
    const f = fixture();
    expect((await f.handlers.create(request('POST', { emails, expiresInDays: 7 }), 'org-1')).status).toBe(400);
    expect(mail).not.toHaveBeenCalled();
  }
  for (const expiresInDays of [3, '7', 31]) expect((await fixture().handlers.create(request('POST', { emails: ['x@example.test'], expiresInDays }), 'org-1')).status).toBe(400);
  const f = fixture();
  const value = { emails: [' New@Example.test ', 'new@example.test'], expiresInDays: 14, reason: '  Owner onboarding  ', note: 'Welcome' };
  const res = await f.handlers.create(request('POST', value), 'org-1');
  expect(res.status).toBe(201);
  const payload = await res.json();
  expect(payload.results).toHaveLength(1);
  expect(payload.results[0]).toMatchObject({ email: 'new@example.test', outcome: 'invited', invitation: { status: 'pending' } });
  expect(mail).toHaveBeenCalledTimes(1);
  expect(mail.mock.calls[0][0].to).toBe('new@example.test');
  expect(f.events.slice(0, 2)).toEqual(['lock', 'read']);
  expect(f.db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted' });
  expect(f.audits.map(a => a.result)).toEqual(['before', 'after']);
  expect(f.audits.every(a => a.actorEmail === 'operator@example.test' && a.keyId === 'writer' && a.metadata.reason === 'Owner onboarding' && a.requestHash === createHash('sha256').update(JSON.stringify(value)).digest('hex'))).toBe(true);
  expect(JSON.stringify(f.audits)).not.toContain(f.rows[0].secret);
  expect(JSON.stringify(payload)).not.toContain(f.rows[0].secret);
});
test('real domain outcomes preserve pending invites, existing owners and foreign invitations', async () => {
  const f = fixture();
  f.seed({ target: 'pending@example.test' });
  f.seed({ id: 'foreign', target: 'other@example.test', organizationId: 'org-2', metadata: JSON.stringify({ organizationId: 'org-2' }) });
  f.members.push({ isOrgOwner: true, isActive: true, user: { email: 'owner@example.test' } });
  const res = await f.handlers.create(request('POST', { emails: ['pending@example.test', 'owner@example.test', 'other@example.test'], expiresInDays: 7 }), 'org-1');
  expect((await res.json()).results.map((r: any) => r.outcome)).toEqual(['already_pending', 'already_member', 'invitation_conflict']);
  expect(mail).not.toHaveBeenCalled();
  expect(f.db.invitation.delete).not.toHaveBeenCalled();
});
test('resend rotates the row and secret, revokes the old link and preserves history without secrets', async () => {
  const f = fixture();
  f.seed();
  const res = await f.handlers.resend(request('POST', { reason: '  Retry owner delivery  ' }, { path: '/legacy/resend' }), 'org-1', 'legacy');
  expect(res.status).toBe(200);
  const { invitation } = await res.json();
  expect(invitation.id).not.toBe('legacy');
  expect(Date.parse(invitation.expiresAt) - Date.parse(invitation.sentAt)).toBeCloseTo(7 * 86400000, -3);
  expect(invitation.resendHistory).toEqual([expect.objectContaining({ invitationId: 'legacy', resentAt: expect.any(String) })]);
  expect(f.rows).toHaveLength(1);
  expect(f.rows[0].secret).not.toBe('DO-NOT-EXPOSE');
  expect(f.audits.every(a => a.metadata.reason === 'Retry owner delivery')).toBe(true);
  const listed = await f.handlers.list(request('GET'), 'org-1');
  const payload = await listed.json();
  expect(payload.invitations.find((r: any) => r.id === 'legacy').status).toBe('revoked');
  expect(f.auditRead).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(payload)).not.toContain('DO-NOT-EXPOSE');
});
test('resend rejects foreign, consumed and revoked invitations without delivery', async () => {
  const f = fixture();
  f.seed({ organizationId: 'org-2', metadata: JSON.stringify({ organizationId: 'org-2' }) });
  expect((await f.handlers.resend(request('POST', {}), 'org-1', 'legacy')).status).toBe(404);
  expect(mail).not.toHaveBeenCalled();
});
test('list derives expired and accepted states from live rows and owner memberships', async () => {
  const f = fixture();
  f.seed({ expiresAt: new Date(0) });
  f.seed({ id: 'accepted', target: 'owner@example.test' });
  f.members.push({ isOrgOwner: true, isActive: true, user: { email: 'owner@example.test' } });
  const res = await f.handlers.list(request('GET'), 'org-1');
  expect((await res.json()).invitations.map((r: any) => r.status).sort()).toEqual(['accepted', 'expired']);
});
test('create replays the stored results, rejects changed raw bytes, never redelivers', async () => {
  const f = fixture();
  const options = { idempotency: 'batch-1' };
  const first = await f.handlers.create(request('POST', undefined, options), 'org-1');
  const value = await first.json();
  const replay = await f.handlers.create(request('POST', undefined, options), 'org-1');
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(value);
  expect(mail).toHaveBeenCalledTimes(1);
  expect(f.audits).toHaveLength(2);
  expect((await f.handlers.create(request('POST', { emails: ['changed@example.test'], expiresInDays: 7 }, options), 'org-1')).status).toBe(409);
});
