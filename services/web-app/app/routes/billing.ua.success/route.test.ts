import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const verifyCheckoutSessionForReturn = mock();

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/student-license/student-license.server', () => ({
  verifyCheckoutSessionForReturn,
}));

const { loader } = await import('./route');

describe('UA billing success route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    verifyCheckoutSessionForReturn.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'membership-1' });
  });

  test('read-only verifies the Checkout Session before redirecting to the gated app', async () => {
    verifyCheckoutSessionForReturn.mockResolvedValue({
      membershipId: 'membership-1',
    });

    const response = await loader({
      request: new Request(
        'https://yawp.school/billing/ua/success?session_id=cs_paid'
      ),
    } as any);

    expect(verifyCheckoutSessionForReturn).toHaveBeenCalledWith('cs_paid');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
  });

  test('rejects missing sessions and sessions owned by another membership', async () => {
    const missing = await loader({
      request: new Request('https://yawp.school/billing/ua/success'),
    } as any);
    expect(missing.status).toBe(400);

    verifyCheckoutSessionForReturn.mockResolvedValue({
      membershipId: 'membership-2',
    });
    const wrongOwner = await loader({
      request: new Request(
        'https://yawp.school/billing/ua/success?session_id=cs_other'
      ),
    } as any);
    expect(wrongOwner.status).toBe(403);
  });
});
