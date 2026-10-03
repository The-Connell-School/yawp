import { describe, expect, test, beforeEach } from 'bun:test';
import { enforceTutorLimits, enforceGradingLimits } from './rate-limit.server';

function uid(suffix: string) {
  return `test-member-${suffix}`;
}

describe('rate-limit token bucket math', () => {
  beforeEach(() => {
    // No explicit reset; buckets naturally advance by time in tests.
  });

  test('tutor: allows 6/min burst, denies 7th, recovers after ~2 minutes', async () => {
    const membershipId = uid('tutor');
    const t0 = Date.now();
    let allowed = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await enforceTutorLimits({
        request: new Request('http://example.com'),
        membershipId,
        route: '/api/domain/tutor-response',
        nowMs: t0 + i * 1000,
      });
      if (res.allowed) allowed += 1;
    }
    expect(allowed).toBe(6);
    const denied = await enforceTutorLimits({
      request: new Request('http://example.com'),
      membershipId,
      route: '/api/domain/tutor-response',
      nowMs: t0 + 7_000,
    });
    expect(denied.allowed).toBe(false);
    // After ~130 seconds enough tokens should refill for one more request
    const recovered = await enforceTutorLimits({
      request: new Request('http://example.com'),
      membershipId,
      route: '/api/domain/tutor-response',
      nowMs: t0 + 130_000,
    });
    expect(recovered.allowed).toBe(true);
  });

  test('grading: allows 22/10min, denies 23rd, recovers after 10 minutes', async () => {
    const membershipId = uid('grading');
    const t0 = Date.now();
    let ok = 0;
    for (let i = 0; i < 22; i += 1) {
      const res = await enforceGradingLimits({
        request: new Request('http://example.com'),
        membershipId,
        route: '/api/domain/grade-essay-ai',
        nowMs: t0 + i * 1000,
      });
      if (res.allowed) ok += 1;
    }
    expect(ok).toBe(22);
    const denied = await enforceGradingLimits({
      request: new Request('http://example.com'),
      membershipId,
      route: '/api/domain/grade-essay-ai',
      nowMs: t0 + 23_000,
    });
    expect(denied.allowed).toBe(false);
    const recovered = await enforceGradingLimits({
      request: new Request('http://example.com'),
      membershipId,
      route: '/api/domain/grade-essay-ai',
      nowMs: t0 + 601_000,
    });
    expect(recovered.allowed).toBe(true);
  });
});

