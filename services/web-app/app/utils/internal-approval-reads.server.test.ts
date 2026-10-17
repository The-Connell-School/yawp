import { beforeEach, afterEach, expect, mock, test } from 'bun:test';
const flags = { ...await import('~/domain/feature-flags/feature-flags.server') };
const freeTier = mock(async () => true);
const v2 = mock(async () => false);
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ ...flags, isFreeTierEnabled: freeTier, isFeatureFlagEnabled: v2 }));
const history = { ...await import('./internal-approval-history.server') };
const followUpFilter = mock(() => ({ adminApprovals: { some: { needsManualFollowUp: true, status: 'PENDING' } } }));
mock.module('./internal-approval-history.server', () => ({ ...history, persistedApprovalFollowUpFilter: followUpFilter }));
const db = { ...await import('./db.server') };
const row = { id: 'a', name: 'Teacher', status: 'SENT', approvalDecisions: [{ id: 'decision' }] };
const reads = mock(async (_args: any): Promise<any[]> => [row]);
const detail = mock(async (_args: any): Promise<any> => row);
const groups = mock(async (_args: any) => [{ status: 'SENT', _count: { _all: 2 } }]);
const approvals = mock(async (_args: any): Promise<any[]> => []);
const logs = mock(async (_args: any): Promise<any[]> => []);
mock.module('./db.server', () => ({ ...db, prisma: new Proxy(db.prisma, { get(target, key) {
  if (key === 'freeTierApplication') return { findMany: reads, findUnique: detail, groupBy: groups };
  if (key === 'freeTierAdminApproval') return { findMany: approvals };
  if (key === 'freeTierEmailLog') return { findMany: logs };
  return Reflect.get(target, key);
} }) }));
const auth = await import('./internal-platform-auth.server');
const { approvalQueue, approvalDetail } = await import('./internal-free-tier-http.server');
const saved = { ...process.env };
const secret = 'local-approval-reads-test-secret-32-characters';
function request(path = 'queue', query = '', method = 'GET') {
  const url = 'https://yawp.test/api/internal/v1/free-tier/approval/' + path + query;
  return new Request(url, { method, headers: auth.signInternalApiRequest({ method, url, keyId: 'read-test', secret, actor: 'staff@example.test' }).headers });
}
beforeEach(() => {
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'read-test', secret, scopes: ['management:read', 'management:write'] }]);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
  auth.resetInternalApiMemoryNonceStore(); auth.resetInternalApiRateLimitBuckets();
  for (const fn of [reads, detail, groups, approvals, logs, v2, followUpFilter]) fn.mockClear();
  freeTier.mockReset().mockResolvedValue(true); reads.mockResolvedValue([row]); detail.mockResolvedValue(row); approvals.mockResolvedValue([]); logs.mockResolvedValue([]);
});
afterEach(() => {
  for (const key of ['YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
test('queue preserves fields and detail includes bounded redacted log with v2 off', async () => {
  const queue = await approvalQueue(request()); expect(queue.status).toBe(200);
  expect(await queue.json()).toEqual({ applications: [{ ...row, adminRequest: null, teacherFollowUps: { count: 0, lastSentAt: null }, forwards: [] }],
    counts: { ADMIN_SUBMITTED: 0, MANUAL_REVIEW: 0, SENT: 2 }, nextCursor: null });
  const response = await approvalDetail(request('applications/a')); expect(response.status).toBe(200);
  expect((await response.json()).application).toEqual({ ...row, adminRequest: null, teacherFollowUps: { count: 0, lastSentAt: null }, forwards: [], emailLog: [] });
  expect(logs.mock.calls.at(-1)![0]).toEqual({ where: { applicationId: 'a' }, take: 50,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, createdAt: true, kind: true, toEmail: true, success: true } });
  expect(v2).not.toHaveBeenCalled(); expect(response.headers.get('cache-control')).toBe('no-store');
});
test('signed flag-off reads reconcile migrated defaults and reminders accepted after a rollout pause', async () => {
  const at = (day: number) => new Date(Date.UTC(2026, 9, day));
  const approval = { id: 'admin', applicationId: 'a', createdAt: at(1), adminName: 'Administrator',
    adminEmail: 'admin@example.test', adminRole: null, status: 'PENDING', decidedAt: null, redirectedFromId: null,
    firstSentAt: null, reminderCount: 0, lastReminderAt: null, lastReminderSource: null };
  approvals.mockResolvedValue([approval]);
  const evidence = [2, 3, 4].map(day => ({ id: 'log-' + day, applicationId: 'a', createdAt: at(day),
    kind: day === 2 ? 'admin_approval' : 'admin_approval_reminder', toEmail: approval.adminEmail, success: true }));
  logs.mockResolvedValue(evidence);
  const queue = await approvalQueue(request());
  expect(queue.status).toBe(200);
  expect((await queue.json()).applications[0].adminRequest).toMatchObject({ reminderCount: 2,
    firstSentAt: at(2).toISOString(), lastReminderAt: at(4).toISOString(), lastReminderSource: null });
  approvals.mockResolvedValue([{ ...approval, firstSentAt: at(2), reminderCount: 1,
    lastReminderAt: at(3), lastReminderSource: 'auto' }]);
  const detail = await approvalDetail(request('applications/a'));
  expect(detail.status).toBe(200);
  expect((await detail.json()).application.adminRequest).toMatchObject({ reminderCount: 2,
    lastReminderAt: at(4).toISOString(), lastReminderSource: null });
  expect(v2).not.toHaveBeenCalled();
});
test('persisted follow-up filter applies before pagination and grouped totals and is cursor bound', async () => {
  reads.mockResolvedValue([row, { ...row, id: 'b' }]);
  const response = await approvalQueue(request('queue', '?needsFollowUp=true&q=Teacher&limit=1'));
  const result = await response.json(); expect(result.applications).toHaveLength(1); expect(result.nextCursor).toBeString();
  const where = reads.mock.calls[0]![0].where;
  expect(where).toMatchObject(followUpFilter()); expect(where.OR).toBeArray();
  expect(groups.mock.calls[0]![0].where).toEqual(where);
  reads.mockResolvedValue([{ ...row, id: 'b' }]);
  const second = await approvalQueue(request('queue', '?needsFollowUp=true&q=Teacher&limit=1&cursor=' + result.nextCursor));
  expect(second.status).toBe(200); expect(reads.mock.calls.at(-1)![0]).toMatchObject({ cursor: { id: 'a' }, skip: 1 });
  expect((await approvalQueue(request('queue', '?q=Teacher&cursor=' + result.nextCursor))).status).toBe(400);
});
test('unfiltered counts retain existing global status totals despite search/status filters', async () => {
  await approvalQueue(request('queue', '?q=Teacher&status=SENT'));
  expect(groups.mock.calls[0]![0].where).toEqual({ status: { in: ['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT'] } });
});
test('reads reject malformed filters, wrong methods, signature, replay, scope and access denial', async () => {
  for (const query of ['?needsFollowUp=1', '?needsFollowUp=', '?limit=0', '?cursor=bad']) expect((await approvalQueue(request('queue', query))).status).toBe(400);
  expect((await approvalQueue(request('queue', '', 'POST'))).status).toBe(405);
  expect((await approvalDetail(request('applications/a', '', 'POST'))).status).toBe(405);
  const req = request(); const copy = req.clone(); expect((await approvalQueue(req)).status).toBe(200); expect((await approvalQueue(copy)).status).toBe(401);
  const invalid = request(); invalid.headers.set(auth.INTERNAL_API_HEADER_SIGNATURE, 'invalid'); expect((await approvalQueue(invalid)).status).toBe(401);
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'read-test', secret, scopes: ['flags:read'] }]);
  expect((await approvalQueue(request())).status).toBe(403);
  freeTier.mockResolvedValue(false); expect((await approvalDetail(request('applications/a'))).status).toBe(404);
});
test('detail not found never queries history', async () => {
  detail.mockResolvedValue(null); expect((await approvalDetail(request('applications/missing'))).status).toBe(404); expect(approvals).not.toHaveBeenCalled();
});
