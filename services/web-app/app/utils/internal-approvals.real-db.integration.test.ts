import { beforeAll, afterAll, afterEach, expect, mock, setSystemTime, test } from 'bun:test';
import { prisma } from './db.server';
import { signInternalApiRequest } from './internal-platform-auth.server';
import { approvalQueue, approvalDetail } from './internal-free-tier-http.server';
import { action } from '~/routes/api.internal.v1.free-tier.approval.$id.resend/route';
import * as cadence from '~/domain/free-tier/approval-v2.server';
import { completeSchoolAdminApproval } from '~/domain/free-tier/approval-flow.server';
const enabled = process.env.INTERNAL_APPROVALS_LOCAL_TEST === '1';
const local = enabled ? test : test.skip;
const prefix = `i1-${Date.now()}`;
const secret = 'local-i1-integration-secret-at-least-32';
const saved = { ...process.env };
const flags = ['feature_flag.free_tier'];
let savedFlags: { name: string; value: string }[] = [];
let validated = false;
const ids: string[] = [];
let currentApprovalId: string;
const at = (day: number) => new Date(Date.UTC(2026, 9, day));
// Only the provider boundary is captured. Route, HMAC, nonce store, Prisma,
// shared resend adapter, delivery engine, locks and email logs are real.
const delivery = mock(async (_message: any): Promise<any> => ({ status: 'success', data: { id: 'captured-local' } }));
mock.module('~/utils/email.server', () => ({ sendEmail: delivery }));
mock.module('~/domain/free-tier/approval-hooks.server', () => ({
  ensureFreeTierProductionApprovalHooks: async () => {},
  getApprovalHooks: () => ({ onApplicationApproved: async () => {}, onApplicationRejected: async () => {} }),
}));
const approvalResendHttp = (request: Request, id?: string) => action({ request, params: { id } } as any);
const base = new Date();
const clock = (elapsed = 0) => setSystemTime(new Date(+base + elapsed));
const dynamicIds: string[] = [];
async function flag(mode = 'targeted') {
  await prisma.setting.update({ where: { name: flags[0] }, data: {
    value: JSON.stringify({ mode, orgIds: mode === 'targeted' ? [prefix] : [] }),
  } });
}
async function fixture() {
  clock(); delivery.mockClear();
  delivery.mockImplementation(async () => ({ status: 'success', data: { id: 'captured-local' } }));
  await flag();
  const app = await prisma.freeTierApplication.create({ data: {
    name: prefix, email: `${crypto.randomUUID()}@example.test`, schoolName: 'Demo academy', location: 'local',
    gradeLevel: '10', status: 'SENT', userId: prefix, organizationId: prefix,
  } });
  dynamicIds.push(app.id);
  const approval = await prisma.freeTierAdminApproval.create({ data: {
    applicationId: app.id, adminName: 'Current admin', adminEmail: 'principal@example.test', emailCopyVersionHash: 'test',
    createdAt: new Date(+base - 1000), firstSentAt: base, nextAutoReminderAt: new Date(+base + cadence.WEEK_MS),
    nextTeacherFollowUpAt: new Date(+base + cadence.WEEK_MS),
  } });
  return { app, approval };
}
const resend = (id: string, key: string) => approvalResendHttp(request(id + '/resend', { reason: 'Captured delivery verification' }, key), id);
async function outcome(response: Response, status: number) {
  const body = await response.json(); expect({ status: response.status, body }).toMatchObject({ status }); return body;
}
async function detail(id: string) {
  return (await (await approvalDetail(request('applications/' + id))).json()).application;
}
afterEach(async () => {
  if (!validated) return;
  setSystemTime();
  await prisma.freeTierApplication.deleteMany({ where: { id: { in: dynamicIds } } });
  dynamicIds.length = 0;
  await flag('off');
});
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
  process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-captured-approval-secret';
  process.env.PRIMARY_APP_URL = 'http://localhost:5199';
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
  for (const name of ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE', 'FREE_TIER_LINK_HMAC_SECRET', 'PRIMARY_APP_URL']) {
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
local('cursor pages preserve applications and null history; persisted filter excludes rows without follow-up', async () => {
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

local('signed staff route accepts captured durable delivery and audits verified identity', async () => {
  const { app, approval } = await fixture();
  const result = await outcome(await resend(app.id, 'accepted-' + app.id), 200);
  expect(result).toEqual({ ok: true, sentAt: base.toISOString(), reminderCount: 1,
    toEmail: approval.adminEmail, nextAutoReminderAt: new Date(+base + cadence.WEEK_MS).toISOString() });
  expect(delivery).toHaveBeenCalledTimes(1);
  expect(delivery.mock.calls[0]![0]).toMatchObject({ to: approval.adminEmail, singleAttempt: true });
  const job = await prisma.freeTierApprovalDelivery.findFirstOrThrow({ where: { approvalId: approval.id } });
  expect(job).toMatchObject({ state: 'SENT', source: 'manual', actorEmail: 'staff@example.test', acceptedReminderCount: 1 });
  const audit = await prisma.internalPlatformApiAudit.findFirstOrThrow({ where: { targetId: app.id } });
  expect(audit).toMatchObject({ actorEmail: 'staff@example.test', keyId: prefix, result: 'success',
    requestHash: expect.stringMatching(/^[a-f0-9]{64}$/), metadata: { source: 'manual', reason: 'Captured delivery verification' } });
  expect((await detail(app.id)).adminRequest).toMatchObject({ reminderCount: 1, lastReminderSource: 'manual', lastReminderAt: base.toISOString() });
});

local('signed same-key replay remains immutable after later manual and automatic acceptance', async () => {
  const { app } = await fixture();
  const first = await outcome(await resend(app.id, 'immutable-' + app.id), 200);
  clock(600000);
  expect((await outcome(await resend(app.id, 'later-' + app.id), 200)).reminderCount).toBe(2);
  expect(await outcome(await resend(app.id, 'immutable-' + app.id), 200)).toEqual(first);
  clock(cadence.WEEK_MS);
  await cadence.runApprovalJobs(new Date());
  expect(await outcome(await resend(app.id, 'immutable-' + app.id), 200)).toEqual(first);
  expect(delivery).toHaveBeenCalledTimes(4); // Three admin reminders, one teacher follow-up.
  expect((await detail(app.id)).adminRequest).toMatchObject({ reminderCount: 3, lastReminderSource: 'auto' });
  expect((await detail(app.id)).teacherFollowUps).toEqual({ count: 1, lastSentAt: new Date().toISOString() });
});

local('concurrent signed same-key requests have one delivery and one immutable acceptance', async () => {
  const { app, approval } = await fixture();
  const responses = await Promise.all(Array.from({ length: 3 }, () => resend(app.id, 'concurrent-' + app.id)));
  // A caller that observes the committed DELIVERING claim before acceptance
  // gets email_failed, never a fabricated success. Fresh signed replays after
  // the concurrent operations settle must all return the same acceptance.
  expect(responses.some(response => response.status === 200)).toBe(true);
  const accepted = await outcome(await resend(app.id, 'concurrent-' + app.id), 200);
  for (const response of responses) {
    expect([200, 502]).toContain(response.status);
    expect(await response.json()).toEqual(response.status === 200 ? accepted : { error: 'email_failed' });
    expect(await outcome(await resend(app.id, 'concurrent-' + app.id), 200)).toEqual(accepted);
  }
  expect(delivery).toHaveBeenCalledTimes(1);
  expect(await prisma.freeTierApprovalDelivery.count({ where: { approvalId: approval.id } })).toBe(1);
  const audits = await prisma.internalPlatformApiAudit.findMany({ where: { targetId: app.id } });
  expect(audits).toHaveLength(7);
  expect(audits.filter(row => row.result === 'success')).toHaveLength(4 + responses.filter(response => response.status === 200).length);
});

local('concurrent signed different keys cannot deliver the same reminder slot twice', async () => {
  const { app, approval } = await fixture();
  const responses = await Promise.all(['one', 'two', 'three'].map(key => resend(app.id, app.id + key)));
  expect(responses.map(response => response.status).sort()).toEqual([200, 409, 409]);
  for (const response of responses) if (response.status === 409) expect(await response.json()).toEqual({ error: 'rate_limited' });
  expect(delivery).toHaveBeenCalledTimes(1);
  expect(await prisma.freeTierApprovalDelivery.count({ where: { approvalId: approval.id } })).toBe(1);
  expect(await prisma.internalPlatformApiAudit.count({ where: { targetId: app.id, result: 'rate_limited' } })).toBe(2);
});

local('signed resend rejects just before cooldown and accepts at exactly ten minutes', async () => {
  const { app } = await fixture();
  await outcome(await resend(app.id, app.id + '-first'), 200);
  clock(599999);
  expect(await outcome(await resend(app.id, app.id + '-early'), 409)).toEqual({ error: 'rate_limited' });
  clock(600000);
  expect(await outcome(await resend(app.id, app.id + '-exact'), 200)).toMatchObject({ reminderCount: 2, sentAt: new Date().toISOString() });
  expect(delivery).toHaveBeenCalledTimes(2);
});

local('signed resend recovers migrated legacy acceptance and its cooldown without counting failed logs', async () => {
  const { app, approval } = await fixture();
  await prisma.freeTierAdminApproval.update({ where: { id: approval.id }, data: { firstSentAt: null } });
  await prisma.freeTierEmailLog.createMany({ data: [
    { applicationId: app.id, kind: 'admin_approval', toEmail: approval.adminEmail, success: true, createdAt: base },
    { applicationId: app.id, kind: 'admin_approval_reminder', toEmail: approval.adminEmail, success: true, createdAt: new Date(+base + 1000) },
    { applicationId: app.id, kind: 'admin_approval_reminder', toEmail: approval.adminEmail, success: false, createdAt: new Date(+base + 600000) },
  ] });
  await flag('off');
  expect((await detail(app.id)).adminRequest).toMatchObject({ reminderCount: 1, lastReminderSource: null, lastReminderAt: new Date(+base + 1000).toISOString() });
  await flag(); clock(600999);
  expect(await outcome(await resend(app.id, app.id + '-early'), 409)).toEqual({ error: 'rate_limited' });
  clock(601000);
  expect(await outcome(await resend(app.id, app.id + '-exact'), 200)).toMatchObject({ reminderCount: 2 });
  expect(delivery).toHaveBeenCalledTimes(1);
});

local('automatic and signed manual reminders share the three-reminder cap and persisted follow-up paging', async () => {
  const { app, approval } = await fixture();
  clock(cadence.WEEK_MS);
  await cadence.runApprovalJobs(new Date());
  for (let index = 1; index <= 2; index++) {
    clock(cadence.WEEK_MS + index * 600000);
    expect((await outcome(await resend(app.id, app.id + '-manual-' + index), 200)).reminderCount).toBe(index + 1);
  }
  clock(cadence.WEEK_MS + 4 * 600000);
  expect(await outcome(await resend(app.id, app.id + '-fifth'), 409)).toEqual({ error: 'not_allowed' });
  clock(2 * cadence.WEEK_MS);
  await cadence.runApprovalJobs(new Date());
  expect((await detail(app.id)).adminRequest).toMatchObject({ reminderCount: 3, autoRemindersStopped: true,
    nextAutoReminderAt: null, needsManualFollowUp: true, stopReason: 'max_reached' });
  expect(await prisma.freeTierApprovalDelivery.count({ where: { approvalId: approval.id, kind: 'admin_reminder', state: 'SENT' } })).toBe(3);
  expect(delivery).toHaveBeenCalledTimes(5); // Three reminders, two teacher follow-ups.
  await flag('off');
  const filtered = await (await approvalQueue(request('queue?q=' + prefix + '&needsFollowUp=true&limit=1'))).json();
  expect(filtered.applications.map((row: any) => row.id)).toEqual([app.id]);
  expect(filtered.counts).toEqual({ ADMIN_SUBMITTED: 0, MANUAL_REVIEW: 0, SENT: 1 });
  expect(filtered.nextCursor).toBeNull();
});

local('flag-off, untargeted and missing-user signed writes never enter legacy delivery', async () => {
  const { app, approval } = await fixture();
  for (const mode of ['off', 'targeted']) {
    await flag(mode);
    if (mode === 'targeted') await prisma.freeTierApplication.update({ where: { id: app.id }, data: { organizationId: 'untargeted' } });
    expect(await outcome(await resend(app.id, app.id + mode), 409)).toEqual({ error: 'flag_off' });
  }
  await prisma.freeTierApplication.update({ where: { id: app.id }, data: { organizationId: prefix, userId: null } });
  expect(await outcome(await resend(app.id, app.id + '-no-user'), 409)).toEqual({ error: 'flag_off' });
  expect(delivery).not.toHaveBeenCalled();
  expect(await prisma.freeTierApprovalDelivery.count({ where: { approvalId: approval.id } })).toBe(0);
  expect(await prisma.freeTierEmailLog.count({ where: { applicationId: app.id } })).toBe(0);
});

for (const uncertain of [false, true]) local(`signed ${uncertain ? 'uncertain' : 'rejected'} delivery never invents history or repeats provider calls on replay`, async () => {
  const { app, approval } = await fixture();
  delivery.mockImplementation(async () => {
    if (uncertain) throw new Error('secret provider transport detail');
    return { status: 'error', error: { statusCode: 400, message: 'secret provider rejection' } };
  });
  const key = app.id + '-failure';
  for (let attempt = 0; attempt < 2; attempt++)
    expect(await outcome(await resend(app.id, key), 502)).toEqual({ error: 'email_failed' });
  expect(delivery).toHaveBeenCalledTimes(1);
  const row = await prisma.freeTierAdminApproval.findUniqueOrThrow({ where: { id: approval.id } });
  expect(row).toMatchObject({ reminderCount: 0, lastReminderAt: null, needsManualFollowUp: uncertain });
  const history = await detail(app.id);
  expect(history.adminRequest).toMatchObject({ reminderCount: 0, lastReminderAt: null });
  expect(history.emailLog).toEqual([{ kind: 'admin_reminder', toEmail: approval.adminEmail, sentAt: expect.any(String), success: false, error: 'email_failed' }]);
  expect(JSON.stringify(history)).not.toContain('secret');
  const job = await prisma.freeTierApprovalDelivery.findFirstOrThrow({ where: { approvalId: approval.id } });
  expect(job).toMatchObject({ state: uncertain ? 'UNCERTAIN' : 'QUEUED', attempts: 1, sentAt: null, acceptedReminderCount: null });
  expect(await prisma.internalPlatformApiAudit.count({ where: { targetId: app.id, result: 'email_failed', actorEmail: 'staff@example.test' } })).toBe(2);
  expect(await outcome(await resend(app.id, app.id + '-new'), 409)).toEqual({ error: uncertain ? 'not_allowed' : 'rate_limited' });
  if (uncertain) {
    clock(2 * cadence.WEEK_MS); await cadence.runApprovalJobs(new Date());
    expect(delivery.mock.calls.filter(([message]) => message.to === approval.adminEmail)).toHaveLength(1);
  }
});

for (const mutation of ['forward', 'approve'] as const) local(`signed resend and ${mutation} serialize with provider acceptance in flight`, async () => {
  const { app, approval } = await fixture();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  delivery.mockImplementationOnce(async () => { entered(); await gate; return { status: 'success', data: { id: 'captured-race' } }; });
  const sending = resend(app.id, app.id + '-race');
  let changing: Promise<any> | undefined;
  try {
    await started;
    let settled = false;
    const message = delivery.mock.calls[0]![0];
    const token = new URL(message.text.match(/http[^\s]+\/free\/admin\/approve\?t=[^\s]+/)[0]).searchParams.get('t')!;
    changing = (mutation === 'forward' ? cadence.forwardApprovalRequest({ applicationId: app.id, userId: prefix,
      currentApprovalId: approval.id, newAdminName: 'Replacement admin', newAdminEmail: 'replacement@example.test',
      request: new Request('http://localhost/test') }) : completeSchoolAdminApproval({ token, adminRole: 'Principal', authorized: true,
        request: new Request('http://localhost/test') })).then(result => { settled = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(settled).toBe(false);
  } finally { release(); }
  await outcome(await sending, 200);
  expect((await changing).ok).toBe(true);
  const row = await prisma.freeTierAdminApproval.findUniqueOrThrow({ where: { id: approval.id } });
  expect(row.status).toBe(mutation === 'forward' ? 'REDIRECTED' : 'APPROVED');
  expect(row.reminderCount).toBe(1);
  if (mutation === 'forward') {
    // The old key belongs to the previous administrator, not the replacement.
    expect(await outcome(await resend(app.id, app.id + '-race'), 400)).toEqual({ error: 'Invalid input' });
    expect((await detail(app.id)).forwards[0]).toMatchObject({ byRole: 'teacher', fromAdminEmail: approval.adminEmail });
  } else expect(await outcome(await resend(app.id, app.id + '-after'), 409)).toEqual({ error: 'not_allowed' });
  expect(delivery.mock.calls.filter(([message]) => message.to === approval.adminEmail)).toHaveLength(1);
});

for (const mutation of ['forward', 'approve'] as const) local(`signed resend queued before ${mutation} cannot deliver to the old administrator`, async () => {
  const { app, approval } = await fixture();
  const key = app.id + '-queued';
  expect((await cadence.queueManualApprovalReminder({ applicationId: app.id, idempotencyKey: key })).ok).toBe(true);
  if (mutation === 'forward') {
    expect((await cadence.forwardApprovalRequest({ applicationId: app.id, userId: prefix, currentApprovalId: approval.id,
      newAdminName: 'Replacement', newAdminEmail: 'replacement@example.test', request: new Request('http://localhost/test') })).ok).toBe(true);
  } else {
    const { mintSignedLink } = await import('~/domain/free-tier/signed-link.server');
    const link = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_APPROVE' });
    await prisma.freeTierAdminApproval.update({ where: { id: approval.id }, data: { signedLinkId: link.linkId } });
    expect((await completeSchoolAdminApproval({ token: link.token, adminRole: 'Principal', authorized: true,
      request: new Request('http://localhost/test') })).ok).toBe(true);
  }
  expect(await outcome(await resend(app.id, key), mutation === 'forward' ? 400 : 409))
    .toEqual({ error: mutation === 'forward' ? 'Invalid input' : 'not_allowed' });
  await cadence.runApprovalJobs(new Date());
  expect(delivery.mock.calls.filter(([message]) => message.to === approval.adminEmail)).toHaveLength(0);
  expect(await prisma.freeTierApprovalDelivery.count({ where: { approvalId: approval.id, state: 'SENT' } })).toBe(0);
});
