import { beforeEach, describe, expect, mock, test } from 'bun:test';

const submitWaitlist = mock();
const count = mock();
const redeemToken = mock(
  async (): Promise<{ ok: boolean; reason?: 'invalid' | 'budget_exceeded' | 'cap_reached'; bypassWaitlist?: boolean }> => ({
    ok: false,
    reason: 'invalid',
  })
);
const findUnique = mock();
const sendReleaseEmailsForApplicationIds = mock(async () => {});

mock.module('~/domain/free-tier/service.server', () => ({
  submitWaitlist,
  findAcquisitionTokenByCredential: async () => null,
  recordAcquisitionTokenScan: async () => {},
  checkTokenValidity: async () => ({ valid: false, reason: 'invalid' as const }),
  redeemToken,
  waitlistInputSchema: {
    safeParse: (v: unknown) => ({ success: true, data: v }),
  },
}));

mock.module('~/domain/free-tier/acquisition-token-scan.server', () => ({
  readScanDedupeCookie: async () => 'decoded-scan-cookie',
  readOrMintScanDedupeCookie: async () => ({ value: 'test-cookie', setCookie: null }),
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: { count, findUnique },
  },
}));

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  sendReleaseEmailsForApplicationIds,
}));

const requireFreeTierEnabled = mock(async () => {});

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled,
}));

mock.module('~/utils/rate-limit.server', () => ({
  enforceUnauthByIpAndTarget: async () => ({ allowed: true }),
}));

const { action, freeTierSubmitSuccessCopy } = await import('./route');

describe('free._index action', () => {
  beforeEach(() => {
    requireFreeTierEnabled.mockReset().mockResolvedValue(undefined);
    submitWaitlist.mockReset();
    count.mockReset().mockResolvedValue(0);
    redeemToken.mockReset().mockResolvedValue({ ok: false, reason: 'invalid' });
    findUnique.mockReset().mockResolvedValue({ id: 'app-1' });
    sendReleaseEmailsForApplicationIds.mockReset();
  });

  test('returns 404 and does not submit waitlist when the flag is off', async () => {
    requireFreeTierEnabled.mockImplementation(async () => {
      const { data } = await import('react-router');
      throw data({ error: 'Not found' }, { status: 404 });
    });
    const form = new FormData();
    form.set('intent', 'waitlist');
    form.set('name', 'Blocked');
    form.set('email', 'blocked@school.example');
    form.set('schoolName', 'School');
    form.set('location', 'Here');
    form.set('gradeLevel', '10');
    const thrown = await action({
      request: new Request('https://yawp.test/free?index', { method: 'POST', body: form }),
      params: {},
      context: {},
    } as never).catch((error) => error);
    expect(thrown).toMatchObject({ type: 'DataWithResponseInit', init: { status: 404 } });
    expect(submitWaitlist).not.toHaveBeenCalled();
  });

  test('non-bypass event token redemption returns waitlist confirmation branch', async () => {
    redeemToken.mockResolvedValueOnce({ ok: true, bypassWaitlist: false });
    const form = new FormData();
    form.set('intent', 'redeem');
    form.set('token', 'event-code');
    form.set('name', 'Wait Listed');
    form.set('email', 'waitlisted@school.example');
    form.set('schoolName', 'School');
    form.set('location', 'Here');
    form.set('gradeLevel', '10');

    const result = await action({
      request: new Request('https://yawp.test/free?t=event-code', { method: 'POST', body: form }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ ok: true, redeemed: true, bypassWaitlist: false });
    expect(redeemToken).toHaveBeenCalledWith(expect.any(Object), { scanDedupeCookie: 'decoded-scan-cookie' });
    expect(sendReleaseEmailsForApplicationIds).not.toHaveBeenCalled();
    expect(freeTierSubmitSuccessCopy(result)).toEqual({
      headline: "You're on the list.",
      detail: "We'll email you when a spot opens.",
    });
  });

  test('bypass event token redemption keeps join-link confirmation branch', async () => {
    redeemToken.mockResolvedValueOnce({ ok: true, bypassWaitlist: true });
    const form = new FormData();
    form.set('intent', 'redeem');
    form.set('token', 'bypass-code');
    form.set('name', 'Invited');
    form.set('email', 'invited@school.example');
    form.set('schoolName', 'School');
    form.set('location', 'Here');
    form.set('gradeLevel', '10');

    const result = await action({
      request: new Request('https://yawp.test/free?t=bypass-code', { method: 'POST', body: form }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ ok: true, redeemed: true, bypassWaitlist: true });
    expect(sendReleaseEmailsForApplicationIds).toHaveBeenCalledWith(['app-1']);
    expect(freeTierSubmitSuccessCopy(result)).toEqual({
      headline: 'Check your email for your join link.',
      detail: null,
    });
  });

  test('bypass event token budget failure does not send a release email', async () => {
    redeemToken.mockResolvedValueOnce({ ok: false, reason: 'budget_exceeded' });
    const form = new FormData();
    form.set('intent', 'redeem');
    form.set('token', 'bypass-code');
    form.set('name', 'Invited');
    form.set('email', 'invited@school.example');
    form.set('schoolName', 'School');
    form.set('location', 'Here');
    form.set('gradeLevel', '10');

    const result = await action({
      request: new Request('https://yawp.test/free?t=bypass-code', { method: 'POST', body: form }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ ok: false, error: 'budget_exceeded' });
    expect(sendReleaseEmailsForApplicationIds).not.toHaveBeenCalled();
  });  test('bypass event token cap-full failure does not send a release email', async () => {
    redeemToken.mockResolvedValueOnce({ ok: false, reason: 'cap_reached' });
    const form = new FormData();
    form.set('intent', 'redeem');
    form.set('token', 'bypass-code');
    form.set('name', 'Invited');
    form.set('email', 'invited@school.example');
    form.set('schoolName', 'School');
    form.set('location', 'Here');
    form.set('gradeLevel', '10');

    const result = await action({
      request: new Request('https://yawp.test/free?t=bypass-code', { method: 'POST', body: form }),
      params: {},
      context: {},
    } as never);

    expect(result).toEqual({ ok: false, error: 'cap_reached' });
    expect(sendReleaseEmailsForApplicationIds).not.toHaveBeenCalled();
  });
});
