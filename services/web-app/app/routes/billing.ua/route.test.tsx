import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const getUaStudentLicenseAccess = mock();
const getUaStudentLicenseBillingState = mock();
const getUaStudentLicenseConfig = mock();
const createOrReuseCheckoutSession = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/domain/student-license/student-license.server', () => ({
  createOrReuseCheckoutSession,
  getUaStudentLicenseAccess,
  getUaStudentLicenseBillingState,
  getUaStudentLicenseConfig,
  isUaStudentLicenseSalesClosed: () => false,
}));

const {
  action,
  loader,
  canStartUaCheckout,
  UA_CHECKOUT_CANCELED_MESSAGE,
  UA_DISPUTE_SUSPENDED_MESSAGE,
} = await import('./route');

describe('UA billing route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    getUaStudentLicenseAccess.mockReset();
    getUaStudentLicenseBillingState.mockReset();
    getUaStudentLicenseConfig.mockReset();
    createOrReuseCheckoutSession.mockReset();
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'membership-1',
      role: 'STUDENT',
      organization: { id: 'org-ua' },
    });
    getUaStudentLicenseAccess.mockResolvedValue('PAYMENT_REQUIRED');
    getUaStudentLicenseBillingState.mockResolvedValue('PAYMENT_REQUIRED');
    getUaStudentLicenseConfig.mockReturnValue({
      enabled: true,
      organizationId: 'org-ua',
      priceId: 'price_ua',
      secretKey: 'sk_test',
      webhookSecret: 'whsec_test',
      applicationOrigin: 'https://yawp.school',
    });
  });

  test('builds Checkout callbacks from canonical config, never the request Host', async () => {
    createOrReuseCheckoutSession.mockResolvedValue({
      kind: 'CHECKOUT',
      url: 'https://checkout.stripe.test/cs_1',
    });

    const response = await action({
      request: new Request('https://attacker.example/billing/ua', {
        method: 'POST',
        headers: { host: 'attacker.example' },
      }),
    } as any);

    expect(createOrReuseCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl:
          'https://yawp.school/billing/ua/success?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
      })
    );
    expect(response.headers.get('location')).toBe(
      'https://checkout.stripe.test/cs_1'
    );
  });

  test('renders the closed-sales state without opening Checkout', async () => {
    createOrReuseCheckoutSession.mockResolvedValue({ kind: 'CLOSED' });
    const response = await action({
      request: new Request('https://yawp.school/billing/ua', {
        method: 'POST',
      }),
    } as any);
    expect(response.headers.get('location')).toBe('/billing/ua?closed=1');
  });

  test('shows a dedicated suspended state and never opens a second Checkout during a dispute', async () => {
    getUaStudentLicenseBillingState.mockResolvedValue('SUSPENDED');
    const loaded = await loader({
      request: new Request('https://yawp.school/billing/ua'),
    } as any);
    expect(loaded).toMatchObject({ suspended: true });

    createOrReuseCheckoutSession.mockResolvedValue({ kind: 'SUSPENDED' });
    const response = await action({
      request: new Request('https://yawp.school/billing/ua', {
        method: 'POST',
      }),
    } as any);
    expect(response.headers.get('location')).toBe(
      '/billing/ua?suspended=1'
    );
    expect(UA_DISPUTE_SUSPENDED_MESSAGE).toContain(
      'cannot start another payment'
    );
    expect(
      canStartUaCheckout({
        closed: false,
        processing: false,
        suspended: true,
      })
    ).toBe(false);
  });

  test('cancellation copy does not claim whether a charge occurred', () => {
    expect(UA_CHECKOUT_CANCELED_MESSAGE).toBe(
      'Checkout was canceled. Retry only if your payment did not complete.'
    );
    expect(UA_CHECKOUT_CANCELED_MESSAGE.toLowerCase()).not.toContain(
      'not been charged'
    );
  });
});
