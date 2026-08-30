import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const fulfillCheckoutSession = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/student-license/student-license.server', () => ({
  fulfillCheckoutSession,
}));

const { loader } = await import('./route');

describe('UA billing success route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    fulfillCheckoutSession.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'membership-1' });
  });

  test('server-verifies the Checkout Session before redirecting to the app', async () => {
    fulfillCheckoutSession.mockResolvedValue({ membershipId: 'membership-1' });

    const response = await loader({
      request: new Request(
        'https://yawp.school/billing/ua/success?session_id=cs_paid'
      ),
    } as any);

    expect(fulfillCheckoutSession).toHaveBeenCalledWith('cs_paid');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
  });

  test('rejects missing sessions and sessions owned by another membership', async () => {
    const missing = await loader({
      request: new Request('https://yawp.school/billing/ua/success'),
    } as any);
    expect(missing.status).toBe(400);

    fulfillCheckoutSession.mockResolvedValue({ membershipId: 'membership-2' });
    const wrongOwner = await loader({
      request: new Request(
        'https://yawp.school/billing/ua/success?session_id=cs_other'
      ),
    } as any);
    expect(wrongOwner.status).toBe(403);
  });
});
