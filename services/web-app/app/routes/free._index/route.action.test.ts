import { beforeEach, describe, expect, mock, test } from 'bun:test';

const submitWaitlist = mock();
const count = mock();

mock.module('~/domain/free-tier/service.server', () => ({
  submitWaitlist,
  checkTokenValidity: async () => ({ ok: false, reason: 'invalid' as const }),
  redeemToken: async () => ({ ok: false, reason: 'invalid' as const }),
  waitlistInputSchema: {
    safeParse: (v: unknown) => ({ success: true, data: v }),
  },
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: { count },
  },
}));

const requireFreeTierEnabled = mock(async () => {});

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled,
}));

mock.module('~/utils/rate-limit.server', () => ({
  enforceUnauthByIpAndTarget: async () => ({ allowed: true }),
}));

const { action } = await import('./route');

describe('free._index action', () => {
  beforeEach(() => {
    requireFreeTierEnabled.mockReset().mockResolvedValue(undefined);
    submitWaitlist.mockReset();
    count.mockReset().mockResolvedValue(0);
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
});
