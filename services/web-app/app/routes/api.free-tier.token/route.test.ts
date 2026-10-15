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
