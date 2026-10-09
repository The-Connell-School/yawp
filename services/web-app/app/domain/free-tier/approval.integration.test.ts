// Real-SQL tests for the approval engine. Run in CI under the Prisma migrations job.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
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
import { setApprovalHooks } from '~/domain/free-tier/approval-hooks.server';

const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const run = Math.random().toString(36).slice(2, 9);
const key = 'k'.repeat(43);
const auth = new Headers({ authorization: `Bearer ${key}` });
process.env.YAWP_MANAGEMENT_SERVICE_KEY = key;

const op = { 'x-yawp-operator-email': 'approver@yawp.local' };

beforeAll(async () => {
  if (!enabled) return;
  const { enableFreeTierFlagForIntegrationTests } = await import(
    './free-tier-integration-flag.server'
  );
  await enableFreeTierFlagForIntegrationTests();
});

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

  const post = (fn: (r: Request) => Promise<Response>, id: string, action: string, body: unknown = {}) =>
    fn(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${id}/${action}`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth), ...op, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  test('approve works from every queue state an operator sees (ADMIN_SUBMITTED, MANUAL_REVIEW, SENT)', async () => {
    for (const from of ['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT'] as const) {
      const a = await makeApp(`approve-${from}`, from);
      const res = await post(approveHttp, a.id, 'approve');
      expect(res.status).toBe(200);
      expect((await res.json()).previousStatus).toBe(from);
      const row = await prisma.freeTierApplication.findUnique({ where: { id: a.id } });
      expect(row?.status).toBe('APPROVED');
    }
  });

  test('approve is refused before the teacher submits admin info and after rejection', async () => {
    for (const from of ['LEAD', 'INVITED', 'ACCOUNT_CREATED', 'REJECTED', 'EXPIRED'] as const) {
      const a = await makeApp(`noapprove-${from}`, from);
      const res = await post(approveHttp, a.id, 'approve');
      expect(res.status).toBe(409);
      const row = await prisma.freeTierApplication.findUnique({ where: { id: a.id } });
      expect(row?.status).toBe(from);
    }
  });

  test('concurrent approve and reject: exactly one decision wins, one audit row, one hook call', async () => {
    let approvedCalls = 0;
    let rejectedCalls = 0;
    setApprovalHooks({ onApplicationApproved: () => void approvedCalls++, onApplicationRejected: () => void rejectedCalls++ });
    try {
      for (let i = 0; i < 5; i++) {
        approvedCalls = 0;
        rejectedCalls = 0;
        const a = await makeApp(`race-${i}`, 'MANUAL_REVIEW');
        const results = await Promise.all([
          post(approveHttp, a.id, 'approve'),
          post(rejectHttp, a.id, 'reject', { reason: 'race' }),
          post(approveHttp, a.id, 'approve'),
        ]);
        const row = await prisma.freeTierApplication.findUnique({ where: { id: a.id } });
        const audits = await prisma.freeTierApprovalDecision.findMany({ where: { applicationId: a.id } });
        expect(audits.length).toBe(1);
        expect(audits[0]!.decision).toBe(row?.status === 'APPROVED' ? 'APPROVED' : 'REJECTED');
        expect(approvedCalls + rejectedCalls).toBe(1);
        for (const r of results) expect([200, 409]).toContain(r.status);
      }
    } finally {
      setApprovalHooks({ onApplicationApproved: () => {}, onApplicationRejected: () => {} });
    }
  });

  test('repeat approve is idempotent: 200, no extra audit row, hook not re-run', async () => {
    let calls = 0;
    setApprovalHooks({ onApplicationApproved: () => void calls++ });
    try {
      const a = await makeApp('idem', 'MANUAL_REVIEW');
      expect((await post(approveHttp, a.id, 'approve')).status).toBe(200);
      const again = await post(approveHttp, a.id, 'approve');
      expect(again.status).toBe(200);
      expect((await again.json()).idempotent).toBe(true);
      expect(await prisma.freeTierApprovalDecision.count({ where: { applicationId: a.id } })).toBe(1);
      expect(calls).toBe(1);
    } finally {
      setApprovalHooks({ onApplicationApproved: () => {} });
    }
  });

  test('a failing hook never undoes the recorded decision', async () => {
    setApprovalHooks({
      onApplicationApproved: () => {
        throw new Error('provisioning down');
      },
    });
    try {
      const a = await makeApp('hookfail', 'MANUAL_REVIEW');
      const res = await post(approveHttp, a.id, 'approve');
      expect(res.status).toBe(200);
      const row = await prisma.freeTierApplication.findUnique({ where: { id: a.id } });
      expect(row?.status).toBe('APPROVED');
      expect(await prisma.freeTierApprovalDecision.count({ where: { applicationId: a.id } })).toBe(1);
    } finally {
      setApprovalHooks({ onApplicationApproved: () => {} });
    }
  });

  test('operator email is required and validated for decisions', async () => {
    const a = await makeApp('noop', 'MANUAL_REVIEW');
    const res = await approveHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${a.id}/approve`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth), 'content-type': 'application/json' },
        body: JSON.stringify({ decidedByEmail: 'not-an-email' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await post(approveHttp, a.id, 'approve', { decidedByEmail: 'Body.Op@Yawp.Local' });
    expect(body.status).toBe(200);
    const audit = await prisma.freeTierApprovalDecision.findFirst({ where: { applicationId: a.id } });
    // header wins over body when both are present
    expect(audit?.decidedByEmail).toBe('approver@yawp.local');
  });

  test('queue includes SENT and reports counts for every queue state', async () => {
    const s = await makeApp('queue-sent', 'SENT');
    const res = await approvalQueue(new Request('https://yawp.test/api/internal/v1/free-tier/approval/queue?status=SENT', { headers: auth }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applications.map((r: any) => r.id)).toContain(s.id);
    expect(body.applications.every((r: any) => r.status === 'SENT')).toBe(true);
    expect(Object.keys(body.counts).sort()).toEqual(['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT']);
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
      const released = await makeApp('reopen-released', 'REJECTED');
      await prisma.freeTierApplication.update({ where: { id: released.id }, data: { releasedAt: new Date() } });
      const ok = await post(reopenHttp, released.id, 'reopen');
      expect(ok.status).toBe(200);
      const idem = await post(reopenHttp, released.id, 'reopen');
      expect(idem.status).toBe(200);
      expect(await prisma.freeTierApprovalDecision.count({ where: { applicationId: released.id } })).toBe(1);
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
    const lead = await makeApp('submit-lead', 'LEAD');
    const bad = await submitAdminInfoHttp(
      new Request(`https://yawp.test/api/internal/v1/free-tier/approval/${lead.id}/submit`, {
        method: 'POST',
        headers: { ...Object.fromEntries(auth) },
      }),
    );
    expect(bad.status).toBe(409);
  });
});

