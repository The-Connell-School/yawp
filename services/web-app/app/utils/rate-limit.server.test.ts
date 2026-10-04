// These tests run the real SQL against Postgres, so they only run when
// RATE_LIMIT_DB_TESTS=1 and DATABASE_URL points at a migrated database:
//   RATE_LIMIT_DB_TESTS=1 DATABASE_URL=postgresql://... bun test app/utils/rate-limit
import { beforeEach, describe, expect, test } from 'bun:test';
import { CLOUDFRONT_IPV4_RANGES } from './cloudfront-ranges.server';

// The app trusts the address CloudFront appended (see ip.server.ts), so the tests
// put a real edge address on the right, as production does.
const EDGE_IP = CLOUDFRONT_IPV4_RANGES[0]!.split('/')[0]!.replace(/\d+$/, (n) => String(Number(n) + 1));

const enabled = process.env.RATE_LIMIT_DB_TESTS === '1';
const mod = enabled ? await import('./rate-limit.server') : null;
const suite = enabled ? describe : describe.skip;
const { prisma } = enabled ? await import('~/utils/db.server') : { prisma: null };

// Platform-wide buckets are shared by every test; start each test from a clean slate.
beforeEach(async () => {
  if (!enabled) return;
  await prisma!.rateLimitBucket.deleteMany({ where: { key: { startsWith: 'global:' } } });
});

const run = Math.random().toString(36).slice(2, 8);
const uid = (label: string) => `t-${run}-${label}`;
const req = () => new Request('http://example.com');
const MIN = 60_000;

async function tutor(id: string, nowMs: number) {
  return mod!.enforceTutorLimits({ request: req(), membershipId: id, route: '/t', nowMs });
}
async function grading(id: string, nowMs: number) {
  return mod!.enforceGradingLimits({ request: req(), membershipId: id, route: '/g', nowMs });
}

suite('token buckets enforce the configured windows', () => {
  test('tutor: 6 in a minute pass, the 7th is denied with a usable Retry-After, then it recovers', async () => {
    const id = uid('tutor-burst');
    const t0 = Date.now();
    for (let i = 0; i < 6; i += 1) expect((await tutor(id, t0 + i * 1000)).allowed).toBe(true);
    const denied = await tutor(id, t0 + 7_000);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.scope).toBe('user');
      // 6/min refill = one token every 10 s; the last refill point was t0+5s.
      expect(denied.retryAfterSeconds).toBeGreaterThan(0);
      expect(denied.retryAfterSeconds).toBeLessThanOrEqual(11);
      const exact = await tutor(id, t0 + 7_000 + denied.retryAfterSeconds * 1000);
      expect(exact.allowed).toBe(true);
    }
  });

  test('grading: a teacher pushing 6/min non-stop is eventually cut off by the hourly ceiling, and recovers', async () => {
    const id = uid('grading-hour');
    const t0 = Date.now();
    let allowed = 0;
    let firstDenied = -1;
    for (let i = 0; i < 180; i += 1) {
      const r = await grading(id, t0 + i * 10_000); // 6/min for 30 minutes
      if (r.allowed) allowed += 1;
      else if (firstDenied < 0) firstDenied = i;
    }
    // Hourly bucket: 80 plus ~1.33/min earned while draining at 6/min.
    expect(allowed).toBeGreaterThanOrEqual(80);
    expect(allowed).toBeLessThanOrEqual(120);
    expect(firstDenied).toBeGreaterThanOrEqual(80);
    expect((await grading(id, t0 + 30 * MIN + 61 * MIN)).allowed).toBe(true);
  });

  test('grading: a whole-class batch of 40 submissions, one every 9 s, is never limited', async () => {
    const id = uid('grading-batch40');
    const t0 = Date.now();
    for (let i = 0; i < 40; i += 1) {
      expect((await grading(id, t0 + i * 9_000)).allowed).toBe(true);
    }
  });

  test('grading: even at the 6/min ceiling a 40-submission batch passes in full', async () => {
    const id = uid('grading-batch40-fast');
    const t0 = Date.now();
    for (let i = 0; i < 40; i += 1) {
      expect((await grading(id, t0 + i * 10_000)).allowed).toBe(true);
    }
  });

  test('grading: 22 requests inside a few minutes all pass', async () => {
    const id = uid('grading-22');
    const t0 = Date.now();
    let ok = 0;
    for (let i = 0; i < 22; i += 1) {
      if ((await grading(id, t0 + Math.floor(i / 6) * MIN + (i % 6) * 5_000)).allowed) ok += 1;
    }
    expect(ok).toBe(22);
  });
});

suite('regressions found in review of the first version', () => {
  test('requests that arrive more often than one refill interval still earn tokens', async () => {
    // Hourly window: 42/h => one token per ~85.7 s. One request every 45 s is a
    // 1.3/min pace (well under p99.9) and must keep being served for 30 minutes
    // of conversation; losing the fractional refill capped it at 6.
    const id = uid('fractional');
    const t0 = Date.now();
    let allowed = 0;
    for (let i = 0; i < 40; i += 1) {
      if ((await tutor(id, t0 + i * 45_000)).allowed) allowed += 1;
    }
    // 6 burst + ~0.7/min earned over 30 min is ~27 minute-window tokens, and the
    // hourly bucket (42) is the binding one: all 40 are within the 42/h budget.
    expect(allowed).toBe(40);
  });

  test('a denied request does not debit later (shared) buckets', async () => {
    const spammer = uid('spammer');
    const bystander = uid('bystander');
    const t0 = Date.now();
    for (let i = 0; i < 6; i += 1) await tutor(spammer, t0);
    // 100 more rejected attempts must not drain the platform-wide tutor bucket
    for (let i = 0; i < 100; i += 1) expect((await tutor(spammer, t0 + 1)).allowed).toBe(false);
    expect((await tutor(bystander, t0 + 2)).allowed).toBe(true);
  });

  test('a request denied by the global bucket refunds the per-user buckets', async () => {
    const id = uid('refund');
    const t0 = Date.now() + 10 * 24 * 3_600_000; // isolate from other tests' global usage
    const globalCap = 40;
    const others = Array.from({ length: globalCap }, (_, i) => uid(`g${i}`));
    for (const other of others) expect((await tutor(other, t0)).allowed).toBe(true);
    const denied = await tutor(id, t0);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.scope).toBe('global');
    // The student's own minute bucket is untouched: six more fit once the platform recovers.
    const later = t0 + 2 * MIN;
    for (let i = 0; i < 6; i += 1) expect((await tutor(id, later)).allowed).toBe(true);
  });

  test('denial is reported (the first version reported every call as allowed)', async () => {
    const id = uid('denial');
    const t0 = Date.now() + 20 * 24 * 3_600_000;
    for (let i = 0; i < 6; i += 1) await tutor(id, t0);
    expect((await tutor(id, t0)).allowed).toBe(false);
  });
});

suite('unauthenticated throttles tolerate a whole class behind one school IP', () => {
  const cfg = () => ({
    perIpPerMinute: 60,
    perIpPerHour: 200,
    perTargetPerHour: 6,
  });
  const fromSchool = () =>
    new Request('https://yawp.school/auth/inv/signup', {
      headers: { 'x-forwarded-for': `198.18.${Math.floor(Math.random() * 250)}.7, ${EDGE_IP}` },
    });

  test('47 different students sign up in the same minute from one IP', async () => {
    const school = new Request('https://yawp.school/auth/inv/signup', {
      headers: { 'x-forwarded-for': `198.19.${Math.floor(Math.random() * 250)}.9, ${EDGE_IP}` },
    });
    const t0 = Date.now();
    let allowed = 0;
    for (let i = 0; i < 47; i += 1) {
      const r = await mod!.enforceUnauthByIpAndTarget({
        request: school,
        route: '/auth/inv/signup',
        targetKey: `${run}-student${i}@school.example`,
        ...cfg(),
        nowMs: t0 + i * 500,
      });
      if (r.allowed) allowed += 1;
    }
    expect(allowed).toBe(47);
  });

  test('one address cannot be mail-bombed: the 7th request for the same email in an hour is denied', async () => {
    const request = fromSchool();
    const t0 = Date.now();
    const results = [];
    for (let i = 0; i < 7; i += 1) {
      results.push(
        await mod!.enforceUnauthByIpAndTarget({
          request,
          route: '/auth/inv/forgot-password',
          targetKey: `${run}-victim@school.example`,
          ...cfg(),
          nowMs: t0 + i * 1000,
        })
      );
    }
    expect(results.slice(0, 6).every((r) => r.allowed)).toBe(true);
    expect(results[6]!.allowed).toBe(false);
  });
});

suite('single-flight lease', () => {
  test('second caller is turned away while the first runs, and can run after release', async () => {
    const name = uid('lease-basic');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = mod!.withSingleFlight(name, () => gate.then(() => 'one'));
    await new Promise((r) => setTimeout(r, 50));
    const second = await mod!.withSingleFlight(name, async () => 'two');
    expect(second.ran).toBe(false);
    release();
    const firstResult = await first;
    expect(firstResult).toEqual({ ran: true, value: 'one' });
    const third = await mod!.withSingleFlight(name, async () => 'three');
    expect(third).toEqual({ ran: true, value: 'three' });
  });

  test('releases when the work throws', async () => {
    const name = uid('lease-throw');
    await expect(
      mod!.withSingleFlight(name, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect((await mod!.withSingleFlight(name, async () => 'ok')).ran).toBe(true);
  });

  test('a lease whose holder vanished expires on its own (no leaked lock)', async () => {
    const name = uid('lease-expire');
    const stuck = mod!.withSingleFlight(name, () => new Promise<string>(() => {}), { ttlMs: 1_000 });
    void stuck;
    await new Promise((r) => setTimeout(r, 100));
    expect((await mod!.withSingleFlight(name, async () => 'x')).ran).toBe(false);
    await new Promise((r) => setTimeout(r, 1_200));
    expect((await mod!.withSingleFlight(name, async () => 'x')).ran).toBe(true);
  });

  test('under a pooled client, 60 concurrent callers for one key: exactly one runs, none leak', async () => {
    const name = uid('lease-concurrent');
    let running = 0;
    let maxRunning = 0;
    const results = await Promise.all(
      Array.from({ length: 60 }, () =>
        mod!.withSingleFlight(name, async () => {
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((r) => setTimeout(r, 150));
          running -= 1;
          return 1;
        })
      )
    );
    expect(results.filter((r) => r.ran).length).toBe(1);
    expect(maxRunning).toBe(1);
    expect((await mod!.withSingleFlight(name, async () => 'after')).ran).toBe(true);
  });
});
