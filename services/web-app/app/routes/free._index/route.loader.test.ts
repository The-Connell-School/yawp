import { beforeEach, describe, expect, mock, test } from 'bun:test';

const findAcquisitionTokenByCredential = mock(async () => ({
  id: 'tok-1',
  label: 'Event',
  code: 'abc',
  uses: 0,
  maxUses: null,
  expiresAt: null,
  bypassWaitlist: false,
  disabledAt: null,
}));
const recordAcquisitionTokenScan = mock(async () => {});
const checkTokenValidity = mock(async () => ({ valid: true as const, label: 'Event' }));

mock.module('~/domain/free-tier/service.server', () => ({
  findAcquisitionTokenByCredential,
  recordAcquisitionTokenScan,
  checkTokenValidity,
  submitWaitlist: async () => ({ ok: true }),
  redeemToken: async () => ({ ok: false, reason: 'invalid' }),
  waitlistInputSchema: { safeParse: () => ({ success: false }) },
}));

const readOrMintScanDedupeCookie = mock(async () => ({
  value: 'fresh-dedupe-cookie',
  setCookie: '__yawp_ft_scan=fresh-dedupe-cookie; Path=/; HttpOnly; SameSite=Lax',
}));

mock.module('~/domain/free-tier/acquisition-token-scan.server', () => ({
  readOrMintScanDedupeCookie,
}));

const requireFreeTierEnabled = mock(async () => {});

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled,
}));

const { loader } = await import('./route');

describe('free._index loader', () => {
  beforeEach(() => {
    requireFreeTierEnabled.mockReset().mockResolvedValue(undefined);
    findAcquisitionTokenByCredential.mockReset().mockResolvedValue({
      id: 'tok-1',
      label: 'Event',
      code: 'abc',
      uses: 0,
      maxUses: null,
      expiresAt: null,
      bypassWaitlist: false,
      disabledAt: null,
    });
    recordAcquisitionTokenScan.mockReset();
    checkTokenValidity.mockReset().mockResolvedValue({ valid: true, label: 'Event' });
    readOrMintScanDedupeCookie.mockReset().mockResolvedValue({
      value: 'fresh-dedupe-cookie',
      setCookie: '__yawp_ft_scan=fresh-dedupe-cookie; Path=/; HttpOnly; SameSite=Lax',
    });
  });

  test('first visit without a cookie returns 200, Set-Cookie, and records one scan', async () => {
    const result = await loader({
      request: new Request('https://yawp.test/free?t=abc'),
      params: {},
      context: {},
    } as never);

    expect(result).toMatchObject({
      type: 'DataWithResponseInit',
      data: {
        mode: 'token',
        token: 'abc',
        linkClosed: false,
        tokenValid: { valid: true, label: 'Event' },
      },
    });
    const init = (result as { init: { status?: number; headers?: HeadersInit } }).init;
    expect(init.status ?? 200).toBe(200);
    const headers = new Headers(init.headers);
    expect(headers.get('Set-Cookie')).toContain('__yawp_ft_scan=');
    expect(recordAcquisitionTokenScan).toHaveBeenCalledTimes(1);
    expect(recordAcquisitionTokenScan).toHaveBeenCalledWith({
      tokenId: 'tok-1',
      dedupeCookie: 'fresh-dedupe-cookie',
      userAgent: null,
    });
  });
});
