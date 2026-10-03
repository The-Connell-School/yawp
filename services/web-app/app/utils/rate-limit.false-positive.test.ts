import { describe, expect, test } from 'bun:test';
import { enforceTutorLimits, enforceGradingLimits } from './rate-limit.server';

describe('false positive guard: normal usage patterns never limited', () => {
  test('tutor: 3/min, 21/hour, 30/day allowed', async () => {
    const user = 'fp-student';
    const t0 = Date.now();
    // 3 in first minute
    for (let i = 0; i < 3; i += 1) {
      const res = await enforceTutorLimits({
        request: new Request('http://example.com'),
        membershipId: user,
        route: '/api/domain/tutor-response',
        nowMs: t0 + i * 10_000,
      });
      expect(res.allowed).toBe(true);
    }
    // Spread ~1 per ~3 minutes for the next hour up to 21 total
    for (let i = 3; i < 21; i += 1) {
      const res = await enforceTutorLimits({
        request: new Request('http://example.com'),
        membershipId: user,
        route: '/api/domain/tutor-response',
        nowMs: t0 + i * 180_000,
      });
      expect(res.allowed).toBe(true);
    }
    // Finish the day budget to 30
    for (let i = 21; i < 30; i += 1) {
      const res = await enforceTutorLimits({
        request: new Request('http://example.com'),
        membershipId: user,
        route: '/api/domain/tutor-response',
        nowMs: t0 + 3_600_000 + (i - 21) * 120_000,
      });
      expect(res.allowed).toBe(true);
    }
  });

  test('grading: 3/min sustained up to 20/hour allowed', async () => {
    const teacher = 'fp-teacher';
    const t0 = Date.now();
    // 3 per minute for ~7 minutes ~ 21 requests
    let allowed = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await enforceGradingLimits({
        request: new Request('http://example.com'),
        membershipId: teacher,
        route: '/api/domain/grade-essay-ai',
        nowMs: t0 + Math.floor(i / 3) * 60_000 + (i % 3) * 10_000,
      });
      if (res.allowed) allowed += 1;
    }
    expect(allowed).toBe(21);
  });
});

