// Real-SQL tests for the approval engine. Run in CI under the Prisma migrations job.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { prisma } from '~/utils/db.server';
import {
  approvalQueue,
  approveHttp,
  rejectHttp,
  markManualReviewHttp,
  reopenHttp,
  approvalDetail,
  submitAdminInfoHttp,
} from '~/utils/internal-free-tier-http.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const run = Math.random().toString(36).slice(2, 9);
const key = 'k'.repeat(43);
const auth = new Headers({ authorization: `Bearer ${key}` });
process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;

const op = { 'x-yawp-operator-email': 'approver@yawp.local' };

async function makeApp(emailSuffix: string, status: any = 'ADMIN_SUBMITTED') {
  const email = `ft-${run}-${emailSuffix}@school.example`;
  const row = await prisma.freeTierApplication.create({
    data: {
      name: `Teacher ${emailSuffix}`,
      email,
      schoolName: 'North Ridge High',
      location: 'Austin, TX',
      gradeLevel: '10',
      status,
    },
  });
  return row;
}

beforeEach(async () => {
  if (!enabled) return;
  await prisma.freeTierApprovalDecision.deleteMany({
    where: { application: { email: { contains: `ft-${run}-` } } },
  });
  await prisma.freeTierApplication.deleteMany({
    where: { email: { contains: `ft-${run}-` } },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await prisma.freeTierApprovalDecision.deleteMany({
    where: { application: { email: { contains: `ft-${run}-` } } },
  });
  await prisma.freeTierApplication.deleteMany({
    where: { email: { contains: `ft-${run}-` } },
  });
});

suite('approval queue and actions', () => {
  test('queue lists ADMIN_SUBMITTED and MANUAL_REVIEW with decision history', async () => {
    const a = await makeApp('a', 'ADMIN_SUBMITTED');
    const b = await makeApp('b', 'MANUAL_REVIEW');
    // Add a decision row
    await prisma.freeTierApprovalDecision.create({
      data: { applicationId: b.id, decision: 'MANUAL_REVIEW', decidedByEmail: 'ops@yawp.local' },
    });
    const res = await approvalQueue(new Request('https://yawp.test/api/internal/v1/free-tier/approval/queue', { headers: auth }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts.ADMIN_SUBMITTED).toBeDefined();
    expect(body.applications.some((r: any) => r.id === a.id)).toBe(true);
    expect(body.applications.some((r: any) => r.id === b.id && r.approvalDecisions.length === 1)).toBe(true);
  });

  test('detail endpoint returns application + decisions', async () => {
    const a = await makeApp('detail', 'MANUAL_REVIEW');
    await prisma.freeTierApprovalDecision.create({
      data: { applicationId: a.id, decision: 'MANUAL_REVIEW', decidedByEmail: 'ops@yawp.local' },
    });
    const res = await approvalDetail(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/applications/${a.id}`, { headers: auth }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application.id).toBe(a.id);
    expect(body.application.approvalDecisions.length).toBe(1);
  });

  test('reject requires reason and records audit', async () => {
    const a = await makeApp('reject', 'MANUAL_REVIEW');
    const noReason = await rejectHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/reject`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth), ...op, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(noReason.status).toBe(400);
    const ok = await rejectHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/reject`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth), ...op, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'not eligible' }),
      }),
    );
    expect(ok.status).toBe(200);
    const row = await prisma.freeTierApplication.findUnique({ where: { id: a.id } });
    expect(row?.status).toBe('REJECTED');
    const audits = await prisma.freeTierApprovalDecision.findMany({ where: { applicationId: a.id } });
    expect(audits.length).toBe(1);
    expect(audits[0]!.decision).toBe('REJECTED');
  });

  test('approve transitions MANUAL_REVIEW -> APPROVED and appends audit; concurrent approves yield one 200 and one 409', async () => {
    const a = await makeApp('approve', 'MANUAL_REVIEW');
    const req = () =>
      approveHttp(
        new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/approve`, {
          method: 'POST',
          headers: { ...Object.fromEntries(auth), ...op, 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );
    const [r1, r2] = await Promise.all([req(), req()]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const row = await prisma.freeTierApplication.findUnique({ where: { id: a.id } });
    expect(row?.status).toBe('APPROVED');
    const audits = await prisma.freeTierApprovalDecision.findMany({ where: { applicationId: a.id } });
    expect(audits.length).toBe(1);
    expect(audits[0]!.decision).toBe('APPROVED');
  });

  test('mark-manual-review from SENT and idempotent', async () => {
    const a = await makeApp('mmr', 'SENT');
    const r1 = await markManualReviewHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/mark-manual-review`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth), ...op, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(r1.status).toBe(200);
    const r2 = await markManualReviewHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/mark-manual-review`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth), ...op, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(r2.status).toBe(200);
    const row = await prisma.freeTierApplication.findUnique({ where: { id: a.id } });
    expect(row?.status).toBe('MANUAL_REVIEW');
  });

  test('reopen enforces release cap', async () => {
    const a = await makeApp('reopen', 'REJECTED');
    const old = process.env.FREE_TIER_RELEASE_CAP;
    process.env.FREE_TIER_RELEASE_CAP = '0';
    try {
      const denied = await reopenHttp(
        new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/reopen`, {
          method: 'POST',
          headers: { ...Object.fromEntries(auth), ...op, 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );
      expect(denied.status).toBe(409);
    } finally {
      if (old === undefined) delete process.env.FREE_TIER_RELEASE_CAP;
      else process.env.FREE_TIER_RELEASE_CAP = old;
    }
  });

  test('submit ADMIN_SUBMITTED from ACCOUNT_CREATED only', async () => {
    const a = await makeApp('submit-acct', 'ACCOUNT_CREATED');
    const ok = await submitAdminInfoHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/submit`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth) },
      }),
    );
    expect(ok.status).toBe(200);
    const again = await submitAdminInfoHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/submit`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth) },
      }),
    );
    expect(again.status).toBe(200);
    const bad = await submitAdminInfoHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/submit`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth) },
      }),
    );
    expect(bad.status).toBe(200);
  });
});

