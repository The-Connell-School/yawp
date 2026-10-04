// Replays measured usage (p99 / p99.9 per window, see
// AI_ENDPOINT_THROTTLING_PLAN.md) against the real buckets. Needs
// RATE_LIMIT_DB_TESTS=1 and a migrated DATABASE_URL (see rate-limit.server.test.ts).
import { beforeEach, describe, expect, test } from 'bun:test';

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
const MIN = 60_000;
const HOUR = 60 * MIN;
const req = () => new Request('http://example.com');

async function replayTutor(id: string, times: number[]) {
  let denied = 0;
  for (const t of times) {
    const r = await mod!.enforceTutorLimits({ request: req(), membershipId: id, route: '/t', nowMs: t });
    if (!r.allowed) denied += 1;
  }
  return denied;
}
async function replayGrading(id: string, times: number[]) {
  let denied = 0;
  for (const t of times) {
    const r = await mod!.enforceGradingLimits({ request: req(), membershipId: id, route: '/g', nowMs: t });
    if (!r.allowed) denied += 1;
  }
  return denied;
}
const evenly = (n: number, spanMs: number, t0: number) =>
  Array.from({ length: n }, (_, i) => t0 + Math.floor((i * spanMs) / n));

suite('normal use is never limited', () => {
  const t0 = Date.now() + 40 * 24 * HOUR;

  test('tutor student at p99.9: 4 in one minute, 32 in an hour, 64 in a day', async () => {
    const id = `fp-${run}-t999`;
    // 32 across the hour, with the 4-in-a-minute burst inside it, then the rest of the day
    const hour = [...evenly(28, HOUR - 5 * MIN, t0), ...evenly(4, 20_000, t0 + 30 * MIN)].sort((a, b) => a - b);
    const rest = evenly(32, 10 * HOUR, t0 + 3 * HOUR);
    expect(await replayTutor(id, [...hour, ...rest])).toBe(0);
  });

  test('tutor student at the single busiest day seen: 70 messages over a school day', async () => {
    const id = `fp-${run}-tmax`;
    expect(await replayTutor(id, evenly(70, 7 * HOUR, t0 + 2 * 24 * HOUR))).toBe(0);
  });

  test('a conversational pace of one message every 45 s for 30 minutes', async () => {
    const id = `fp-${run}-pace`;
    expect(await replayTutor(id, evenly(40, 30 * MIN, t0 + 5 * 24 * HOUR))).toBe(0);
  });

  test('whole class of 30 students sends their first tutor message within 2 minutes', async () => {
    const day = t0 + 7 * 24 * HOUR;
    let denied = 0;
    for (let i = 0; i < 30; i += 1) {
      denied += await replayTutor(`fp-${run}-class${i}`, [day + Math.floor((i * 2 * MIN) / 30)]);
    }
    expect(denied).toBe(0);
  });

  test('grading teacher at p99.9: 17 in ten minutes, 29 in an hour, 68 in a day', async () => {
    const id = `fp-${run}-g999`;
    const day = t0 + 9 * 24 * HOUR;
    const times = [
      ...evenly(17, 10 * MIN, day), // 17 in the first ten minutes (<= 6 in any minute)
      ...evenly(12, 50 * MIN, day + 10 * MIN),
      ...evenly(39, 6 * HOUR, day + 2 * HOUR),
    ];
    expect(await replayGrading(id, times)).toBe(0);
  });
});
