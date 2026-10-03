import { describe, expect, test } from 'bun:test';
import { enforceTutorLimits } from './rate-limit.server';

describe('abuse simulation and recovery', () => {
  test('spam gets 429 and then recovers after waiting Retry-After-ish interval', async () => {
    const membershipId = 'sim-spammer';
    const base = Date.now();
    // Exhaust minute bucket quickly
    for (let i = 0; i < 6; i += 1) {
      const res = await enforceTutorLimits({
        request: new Request('http://example.com'),
        membershipId,
        route: '/api/domain/tutor-response',
        nowMs: base + i * 500,
      });
      expect(res.allowed).toBe(true);
    }
    const denied = await enforceTutorLimits({
      request: new Request('http://example.com'),
      membershipId,
      route: '/api/domain/tutor-response',
      nowMs: base + 5_000,
    });
    expect(denied.allowed).toBe(false);
    // Wait ~2 minutes for refill, should be allowed again
    const recovered = await enforceTutorLimits({
      request: new Request('http://example.com'),
      membershipId,
      route: '/api/domain/tutor-response',
      nowMs: base + 125_000,
    });
    expect(recovered.allowed).toBe(true);
  });
});

