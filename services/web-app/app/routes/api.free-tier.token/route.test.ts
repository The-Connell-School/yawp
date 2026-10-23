import { beforeEach, expect, mock, test } from 'bun:test';
import { z } from 'zod';

const redeemToken = mock(async (): Promise<any> => ({ ok: true, bypassWaitlist: true }));
mock.module('~/domain/free-tier/service.server', () => ({
  redeemToken,
  redeemInputSchema: z.object({ email: z.string().email(), token: z.string() }).passthrough(),
  normalizeEmail: (email: string) => email.toLowerCase(),
  hashToken: (token: string) => token,
  checkTokenValidity: async () => ({ valid: true }),
}));
mock.module('~/utils/rate-limit.server', () => ({
  enforceUnauthByIpAndTarget: async () => ({ allowed: true }),
}));
mock.module('~/domain/free-tier/public-onboarding.server', () => ({
  isPublicOnboardingV2Enabled: async () => false,
  isSupportedSignupGrade: (grade: string) =>
    ['9', '10', '11', '12'].includes(grade),
}));
const { readOrMintScanDedupeCookie } = await import('~/domain/free-tier/acquisition-token-scan.server');
const { action } = await import('./route');
beforeEach(() => redeemToken.mockReset());

for (const [reason, status] of [['cap_reached', 409], ['budget_exceeded', 402]] as const) {
  test(`token HTTP handles ${reason} distinctly and returns no application details`, async () => {
    redeemToken.mockResolvedValue({ ok: false, reason });
    const result = await action({ request: new Request('http://localhost/api/free-tier/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'local-event', email: 'teacher@yawp.local' }),
    }) } as never);
    expect(result.status).toBe(status);
    expect(await result.json()).toEqual({ ok: false, reason });
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
}

 test('passes scan identity to redemption without exposing it in the response', async () => {
  redeemToken.mockResolvedValue({ ok: true, bypassWaitlist: true });
  const scan = await readOrMintScanDedupeCookie(new Request('http://localhost/free'));
  const response = await action({ request: new Request('http://localhost/api/free-tier/token', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `other=x; ${scan.setCookie!.split(';')[0]}` },
    body: JSON.stringify({ token: 'event', email: 'teacher@yawp.local' }),
  }) } as never);
  expect(redeemToken).toHaveBeenCalledWith(expect.any(Object), { scanDedupeCookie: scan.value });
  expect(await response.json()).toEqual({ ok: true, bypassWaitlist: true });
});
