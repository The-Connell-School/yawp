import { beforeAll, afterAll, expect, mock, test } from 'bun:test';
import { prisma } from './db.server';
import { signInternalApiRequest } from './internal-platform-auth.server';
import { approvalQueue, approvalDetail } from './internal-free-tier-http.server';
import { approvalResendHttp } from './internal-approval-resend.server';
const enabled = process.env.INTERNAL_APPROVALS_LOCAL_TEST === '1';
const local = enabled ? test : test.skip;
const prefix = `i1-${Date.now()}`;
const secret = 'local-i1-integration-secret-at-least-32';
const saved = { ...process.env };
const flags = ['feature_flag.free_tier', 'feature_flag.free-tier-onboarding-v2'];
let savedFlags: { name: string; value: string }[] = [];
let validated = false;
const ids: string[] = [];
let currentApprovalId: string;
const at = (day: number) => new Date(Date.UTC(2026, 9, day));
const email = { ...await import('~/domain/free-tier/email.server') };
const delivery = mock(async () => { throw new Error('Actual email forbidden in I1 verification'); });
mock.module('~/domain/free-tier/email.server', () => ({ ...email, sendFreeTierAdminReminderEmail: delivery }));
function request(path: string, body?: unknown, key = 'one') {
  const url = 'http://localhost/api/internal/v1/free-tier/approval/' + path;
  const method = body === undefined ? 'GET' : 'POST'; const text = body === undefined ? '' : JSON.stringify(body);
  return new Request(url, { method, body: body === undefined ? undefined : text,
    headers: { ...signInternalApiRequest({ method, url, keyId: prefix, secret, actor: 'Staff@Example.test', body: text }).headers,
      'content-type': 'application/json', 'Idempotency-Key': key } });
}
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(process.env.E2E_DATABASE_URL || process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_ia-i1-approvals-'))
    throw new Error('Dedicated I1 local database required');
  validated = true;
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: prefix, secret, scopes: ['management:read', 'management:write'] }]);
  delete process.env.INTERNAL_API_NONCE_STORE;
  savedFlags = await prisma.setting.findMany({ where: { name: { in: flags } }, select: { name: true, value: true } });
  for (const name of flags) await prisma.setting.upsert({ where: { name }, create: { name, value: name.endsWith('.free_tier') ? 'true' : 'false' }, update: { value: name.endsWith('.free_tier') ? 'true' : 'false' } });
  for (let index = 0; index < 3; index++) {
    const app = await prisma.freeTierApplication.create({ data: { name: prefix, email: `${prefix}-${index}@example.test`,
      schoolName: 'Demo academy', location: 'local', gradeLevel: '10', status: index === 2 ? 'MANUAL_REVIEW' : 'SENT' } });
    ids.push(app.id);
  }
  const previous = await prisma.freeTierAdminApproval.create({ data: { applicationId: ids[0]!, adminName: 'First admin', adminEmail: 'first@example.test',
    createdAt: at(1), decidedAt: at(4), status: 'REDIRECTED', emailCopyVersionHash: 'test' } });
  const current = await prisma.freeTierAdminApproval.create({ data: { applicationId: ids[0]!, adminName: 'Current admin', adminEmail: 'current@example.test',
    createdAt: at(5), redirectedFromId: previous.id, status: 'PENDING', emailCopyVersionHash: 'test' } });
  currentApprovalId = current.id;
  for (const [kind, day, success, toEmail] of [
    ['admin_approval', 2, true, 'first@example.test'], ['admin_approval_reminder', 3, true, 'first@example.test'],
    ['admin_approval', 5, false, 'current@example.test'], ['admin_approval', 6, true, 'current@example.test'],
    ['admin_approval_reminder', 7, false, 'current@example.test'], ['admin_approval_reminder', 8, true, 'current@example.test'],
    ['teacher_followup', 3, true, 'teacher@example.test'], ['teacher_followup', 9, true, 'teacher@example.test'],
  ] as const) await prisma.freeTierEmailLog.create({ data: { applicationId: ids[0]!, kind, createdAt: at(day), toEmail, success,
    error: success ? null : 'provider credential secret', payload: { signedUrl: 'https://example.test/?t=secret' } } });
  await prisma.freeTierEmailLog.createMany({ data: Array.from({ length: 55 }, (_, index) => ({
    applicationId: ids[0]!, kind: 'forward_notice', createdAt: new Date(at(10).getTime() + index),
    toEmail: 'teacher@example.test', success: index % 2 === 0, error: 'provider secret', payload: { token: 'secret' },
  })) });
});
afterAll(async () => {
  if (!validated) return;
  await prisma.freeTierApplication.deleteMany({ where: { id: { in: ids } } });
  await prisma.internalPlatformApiAudit.deleteMany({ where: { keyId: prefix } });
  await prisma.internalApiRequestNonce.deleteMany({ where: { keyId: prefix } });
  for (const name of flags) {
    const previous = savedFlags.find(row => row.name === name);
    if (previous) await prisma.setting.update({ where: { name }, data: { value: previous.value } });
    else await prisma.setting.deleteMany({ where: { name } });
  }
  for (const name of ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE']) {
    if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
  await prisma.$disconnect();
});
local('flag-off detail reads accepted history outside the 50-row display, preserves legacy role nulls', async () => {
  const response = await approvalDetail(request('applications/' + ids[0])); expect(response.status).toBe(200);
  const { application } = await response.json();
  expect(application.adminRequest).toMatchObject({ currentApprovalId, adminRole: null, firstSentAt: at(6).toISOString(),
    reminderCount: 1, lastReminderAt: at(8).toISOString(), lastReminderSource: null, nextAutoReminderAt: null });
  expect(application.teacherFollowUps).toEqual({ count: 2, lastSentAt: at(9).toISOString() });
  expect(application.forwards).toEqual([{ approvalId: expect.any(String), fromAdminName: 'First admin', fromAdminEmail: 'first@example.test',
    toAdminName: 'Current admin', toAdminEmail: 'current@example.test', forwardedAt: at(4).toISOString(), byRole: null }]);
  expect(application.emailLog).toHaveLength(50); expect(JSON.stringify(application)).not.toContain('secret');
  expect(application.emailLog[0].sentAt).toBe(new Date(at(10).getTime() + 54).toISOString());
  expect(response.headers.get('cache-control')).toBe('no-store');
});
local('cursor pages preserve applications and null history, persisted-only filter returns zero on legacy schema', async () => {
  let cursor: string | null = null; const found: string[] = [];
  do {
    const response = await approvalQueue(request('queue?q=' + prefix + '&limit=1' + (cursor ? '&cursor=' + cursor : '')));
    expect(response.status).toBe(200); const result = await response.json();
    for (const app of result.applications) { found.push(app.id); if (app.id !== ids[0]) expect(app.adminRequest).toBeNull(); }
    cursor = result.nextCursor;
  } while (cursor);
  expect(found.sort()).toEqual([...ids].sort());
  const result = await (await approvalQueue(request('queue?q=' + prefix + '&needsFollowUp=true&limit=1'))).json();
  expect(result).toEqual({ applications: [], counts: { ADMIN_SUBMITTED: 0, MANUAL_REVIEW: 0, SENT: 0 }, nextCursor: null });
});
local('v2-only resend refuses legacy path on concurrent keys and audits verified staff; no email', async () => {
  const before = await prisma.freeTierEmailLog.count({ where: { applicationId: ids[0] } });
  const responses = await Promise.all(['same', 'same', 'different'].map(key => approvalResendHttp(request(ids[0] + '/resend', { reason: 'Local verification' }, key), ids[0])));
  for (const response of responses) { expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'flag_off' }); }
  expect(delivery).not.toHaveBeenCalled(); expect(await prisma.freeTierEmailLog.count({ where: { applicationId: ids[0] } })).toBe(before);
  const audit = await prisma.internalPlatformApiAudit.findMany({ where: { keyId: prefix } }); expect(audit).toHaveLength(3);
  for (const row of audit) expect(row).toMatchObject({ actorEmail: 'staff@example.test', result: 'flag_off', targetId: ids[0],
    metadata: { source: 'manual', reason: 'Local verification' } });
});
local('durable request nonce replay is denied and absent application returns 404', async () => {
  const req = request('queue?q=' + prefix); const replay = req.clone();
  expect((await approvalQueue(req)).status).toBe(200); expect((await approvalQueue(replay)).status).toBe(401);
  expect((await approvalDetail(request('applications/does-not-exist'))).status).toBe(404);
  expect((await approvalResendHttp(request('does-not-exist/resend', {}), 'does-not-exist')).status).toBe(404);
});
