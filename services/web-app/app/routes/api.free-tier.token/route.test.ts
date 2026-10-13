import { beforeEach, describe, expect, mock, test } from 'bun:test';

const redeemToken = mock();

mock.module('~/domain/free-tier/service.server', () => ({
  checkTokenValidity: mock(),
  hashToken: (token: string) => `hash:${token}`,
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  redeemInputSchema: {
    safeParse: (input: unknown) => ({ success: true, data: input }),
  },
  redeemToken,
}));

mock.module('~/domain/free-tier/acquisition-token-scan.server', () => ({
  FREE_TIER_SCAN_DEDUPE_COOKIE: '__yawp_ft_scan',
}));

mock.module('~/utils/rate-limit.server', () => ({
  enforceUnauthByIpAndTarget: mock(async () => ({ allowed: true })),
}));

const { action } = await import('./route');

describe('/api/free-tier/token', () => {
  beforeEach(() => {
    redeemToken.mockReset();
    redeemToken.mockResolvedValue({ ok: true, bypassWaitlist: true });
  });

  test('passes the scan dedupe cookie to token redemption for PostHog aliasing', async () => {
    const body = {
      name: 'Ada',
      email: 'ada@example.test',
      schoolName: 'North High',
      location: 'Denver',
      gradeLevel: '10',
      token: 'qr-token',
    };

    const response = await action({
      request: new Request('https://yawp.test/api/free-tier/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'other=1; __yawp_ft_scan=scan-cookie-value',
        },
        body: JSON.stringify(body),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(redeemToken).toHaveBeenCalledWith(body, {
      scanDedupeCookie: 'scan-cookie-value',
    });
  });
});
