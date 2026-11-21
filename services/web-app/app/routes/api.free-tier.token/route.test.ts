import { beforeEach, expect, mock, test } from 'bun:test';
import { z } from 'zod';

const redeemToken = mock(async (): Promise<any> => ({ ok: true, bypassWaitlist: true }));
const submitWaitlist = mock(async (..._args: any[]): Promise<any> => ({ ok: true }));
mock.module('~/domain/free-tier/service.server', () => ({
  redeemToken,
  submitWaitlist,
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
    ['6', '7', '8', '9', '10', '11', '12', 'K', '1', '2', '3', '4', '5'].includes(
      grade
    ),
}));
const { readOrMintScanDedupeCookie } = await import('~/domain/free-tier/acquisition-token-scan.server');
const { action } = await import('./route');
beforeEach(() => { redeemToken.mockReset(); submitWaitlist.mockClear(); });

for (const reason of ['cap_reached', 'budget_exceeded', 'exhausted', 'expired', 'disabled', 'invalid'] as const) {
  test(`token HTTP falls back to the waitlist on ${reason} and returns no application details`, async () => {
    redeemToken.mockResolvedValue({ ok: false, reason });
    const result = await action({ request: new Request('http://localhost/api/free-tier/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'local-event', email: 'teacher@yawp.local' }),
    }) } as never);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true, bypassWaitlist: false });
    expect(submitWaitlist).toHaveBeenCalledWith(expect.not.objectContaining({ token: expect.anything() }), undefined);
    expect(submitWaitlist).toHaveBeenCalledWith(expect.objectContaining({ email: 'teacher@yawp.local' }), undefined);
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
