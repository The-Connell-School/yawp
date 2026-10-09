import { beforeEach, describe, expect, mock, test } from 'bun:test';

const queryRaw = mock(() => new Promise<never>(() => {}));
const rateLimitDecisionCreate = mock(async () => ({}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    $queryRawUnsafe: queryRaw,
    rateLimitDecision: { create: rateLimitDecisionCreate },
  },
}));

const { consumeLoginAttemptRateLimits } = await import('./rate-limit.server');
const { RATE_LIMITS } = await import('~/config/rate-limits');

describe('login rate limiter fail-closed', () => {
  beforeEach(() => {
    queryRaw.mockClear();
    rateLimitDecisionCreate.mockClear();
  });

  test(
    'times out when Postgres never responds and denies the attempt',
    async () => {
    const request = new Request('https://yawp.school/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    const cfg = RATE_LIMITS.unauth.login;
    const result = await consumeLoginAttemptRateLimits({
      request,
      route: '/auth/login',
      targetKey: 'student@school.test',
      perIpPerMinute: cfg.perIpPerMinute,
      perIpPerHour: cfg.perIpPerHour,
      perTargetPerHour: cfg.perEmailPerHour,
      perIpHandlePer15Minutes: cfg.perIpHandlePer15Minutes,
      perIpSprayPerHour: cfg.perIpFailedSprayPerHour,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
    },
    15_000
  );
});
