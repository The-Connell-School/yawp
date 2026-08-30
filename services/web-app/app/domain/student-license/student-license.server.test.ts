import { describe, expect, mock, test } from 'bun:test';
import {
  UA_STUDENT_LICENSE_COHORT,
  UA_STUDENT_LICENSE_VALID_UNTIL,
  applyStripeWebhookTransition,
  fulfillCheckoutSession,
  getUaStudentLicenseConfig,
  resolveUaStudentLicenseAccess,
} from './student-license.server';

const enabledEnv = {
  UA_STUDENT_BILLING_ENABLED: 'true',
  UA_ORGANIZATION_ID: 'org-ua',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  STRIPE_UA_2026_PRICE_ID: 'price_ua_2026',
};

describe('UA student license configuration', () => {
  test('defaults the feature off without requiring Stripe credentials', () => {
    expect(getUaStudentLicenseConfig({})).toEqual({ enabled: false });
  });

  test('requires all server configuration when enabled', () => {
    expect(() =>
      getUaStudentLicenseConfig({ UA_STUDENT_BILLING_ENABLED: 'true' })
    ).toThrow('Invalid UA student billing configuration');
  });
});

describe('UA student license access', () => {
  const config = getUaStudentLicenseConfig(enabledEnv);

  test('bypasses teachers and students from other organizations', () => {
    expect(
      resolveUaStudentLicenseAccess({
        config,
        membership: { id: 'teacher', role: 'TEACHER', organizationId: 'org-ua' },
        entitlement: null,
        now: new Date('2026-09-01T00:00:00.000Z'),
      })
    ).toBe('BYPASS');

    expect(
      resolveUaStudentLicenseAccess({
        config,
        membership: { id: 'student', role: 'STUDENT', organizationId: 'org-other' },
        entitlement: null,
        now: new Date('2026-09-01T00:00:00.000Z'),
      })
    ).toBe('BYPASS');
  });

  test('requires payment only for the configured UA student cohort', () => {
    expect(
      resolveUaStudentLicenseAccess({
        config,
        membership: { id: 'student', role: 'STUDENT', organizationId: 'org-ua' },
        entitlement: null,
        now: new Date('2026-09-01T00:00:00.000Z'),
      })
    ).toBe('PAYMENT_REQUIRED');
  });

  test('accepts manual and existing-subscription entitlements until the exclusive cutoff', () => {
    for (const source of ['MANUAL', 'EXISTING_SUBSCRIPTION'] as const) {
      expect(
        resolveUaStudentLicenseAccess({
          config,
          membership: { id: 'student', role: 'STUDENT', organizationId: 'org-ua' },
          entitlement: {
            cohort: UA_STUDENT_LICENSE_COHORT,
            source,
            status: 'ACTIVE',
            validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          },
          now: new Date('2027-01-01T05:59:59.999Z'),
        })
      ).toBe('ACTIVE');
    }

    expect(
      resolveUaStudentLicenseAccess({
        config,
        membership: { id: 'student', role: 'STUDENT', organizationId: 'org-ua' },
        entitlement: {
          cohort: UA_STUDENT_LICENSE_COHORT,
          source: 'STRIPE_CHECKOUT',
          status: 'ACTIVE',
          validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
        },
        now: UA_STUDENT_LICENSE_VALID_UNTIL,
      })
    ).toBe('PAYMENT_REQUIRED');
  });

  test('denies refunded, disputed, and revoked licenses', () => {
    for (const status of ['REFUNDED', 'DISPUTED', 'REVOKED'] as const) {
      expect(
        resolveUaStudentLicenseAccess({
          config,
          membership: { id: 'student', role: 'STUDENT', organizationId: 'org-ua' },
          entitlement: {
            cohort: UA_STUDENT_LICENSE_COHORT,
            source: 'STRIPE_CHECKOUT',
            status,
            validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          },
          now: new Date('2026-09-01T00:00:00.000Z'),
        })
      ).toBe('PAYMENT_REQUIRED');
    }
  });
});

describe('Checkout fulfillment', () => {
  test('retrieves and verifies Stripe state before activating exactly once', async () => {
    const retrieve = mock().mockResolvedValue({
      id: 'cs_paid',
      mode: 'payment',
      payment_status: 'paid',
      amount_total: 5000,
      currency: 'usd',
      customer: 'cus_123',
      payment_intent: 'pi_123',
      metadata: {
        membershipId: 'membership-1',
        organizationId: 'org-ua',
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
      line_items: {
        data: [{ price: { id: 'price_ua_2026' } }],
      },
    });
    const findMembership = mock().mockResolvedValue({
      id: 'membership-1',
      organizationId: 'org-ua',
      role: 'STUDENT',
    });
    const activate = mock().mockResolvedValue({ id: 'license-1' });

    const dependencies = {
      retrieveCheckoutSession: retrieve,
      findMembership,
      activate,
    };

    const first = await fulfillCheckoutSession('cs_paid', {
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies,
    });
    const second = await fulfillCheckoutSession('cs_paid', {
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies,
    });

    expect(first).toMatchObject({ membershipId: 'membership-1' });
    expect(second).toMatchObject({ membershipId: 'membership-1' });
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenCalledTimes(2);
    expect(activate.mock.calls[0]?.[0]).toMatchObject({
      cohort: UA_STUDENT_LICENSE_COHORT,
      membershipId: 'membership-1',
      stripeCheckoutSessionId: 'cs_paid',
      stripePaymentIntentId: 'pi_123',
      validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
    });
  });

  test('does not grant access from an unpaid or mismatched Checkout Session', async () => {
    const base = {
      id: 'cs_bad',
      mode: 'payment',
      payment_status: 'unpaid',
      amount_total: 5000,
      currency: 'usd',
      customer: 'cus_123',
      payment_intent: 'pi_123',
      metadata: {
        membershipId: 'membership-1',
        organizationId: 'org-ua',
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
      line_items: { data: [{ price: { id: 'price_ua_2026' } }] },
    };
    const activate = mock();

    await expect(
      fulfillCheckoutSession('cs_bad', {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: mock().mockResolvedValue(base),
          findMembership: mock(),
          activate,
        },
      })
    ).rejects.toThrow('Checkout Session is not paid');

    await expect(
      fulfillCheckoutSession('cs_bad', {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: mock().mockResolvedValue({
            ...base,
            payment_status: 'paid',
            amount_total: 4900,
          }),
          findMembership: mock(),
          activate,
        },
      })
    ).rejects.toThrow('Checkout Session does not match the UA license');

    expect(activate).not.toHaveBeenCalled();
  });
});

describe('durable Stripe webhook transitions', () => {
  test('records the event and activation in one transaction', async () => {
    const recordEvent = mock();
    const activate = mock();
    const revoke = mock();
    const transaction = mock(async (work: (tx: any) => Promise<void>) =>
      work({ recordEvent, activate, revoke })
    );

    const result = await applyStripeWebhookTransition(
      {
        eventId: 'evt_checkout',
        eventType: 'checkout.session.completed',
        transition: {
          kind: 'ACTIVATE',
          checkout: {
            membershipId: 'membership-1',
            organizationId: 'org-ua',
            stripeCheckoutSessionId: 'cs_paid',
            stripePaymentIntentId: 'pi_paid',
            stripeCustomerId: 'cus_1',
            stripePriceId: 'price_ua_2026',
            cohort: UA_STUDENT_LICENSE_COHORT,
            amountPaid: 5000,
            currency: 'usd',
            validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          },
        },
      },
      { transaction }
    );

    expect(result).toEqual({ duplicate: false, handled: true });
    expect(recordEvent).toHaveBeenCalledWith(
      'evt_checkout',
      'checkout.session.completed'
    );
    expect(activate).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  test('treats a duplicate event id as success without repeating the transition', async () => {
    const activate = mock();
    const transaction = mock(async (work: (tx: any) => Promise<void>) =>
      work({
        recordEvent: mock(() => {
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }),
        activate,
        revoke: mock(),
      })
    );

    const result = await applyStripeWebhookTransition(
      {
        eventId: 'evt_duplicate',
        eventType: 'checkout.session.completed',
        transition: { kind: 'IGNORE' },
      },
      { transaction }
    );

    expect(result).toEqual({ duplicate: true, handled: false });
    expect(activate).not.toHaveBeenCalled();
  });

  test('revokes access for refunds and disputes by PaymentIntent id', async () => {
    const revoke = mock();
    const transaction = mock(async (work: (tx: any) => Promise<void>) =>
      work({ recordEvent: mock(), activate: mock(), revoke })
    );

    await applyStripeWebhookTransition(
      {
        eventId: 'evt_refund',
        eventType: 'charge.refunded',
        transition: {
          kind: 'REVOKE',
          paymentIntentId: 'pi_refunded',
          status: 'REFUNDED',
        },
      },
      { transaction }
    );

    expect(revoke).toHaveBeenCalledWith('pi_refunded', 'REFUNDED');
  });
});
