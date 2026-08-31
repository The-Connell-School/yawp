import { describe, expect, mock, test } from 'bun:test';
import Stripe from 'stripe';
import {
  UA_STUDENT_LICENSE_COHORT,
  UA_STUDENT_LICENSE_VALID_UNTIL,
  applyStripeWebhookTransition,
  assertStripeModeAllowed,
  createOrReuseCheckoutSession,
  getUaStudentLicenseConfig,
  getE2EStripeClientOptions,
  getUaStudentLicenseNow,
  isUaStudentLicenseSalesClosed,
  isStripePaymentReconciliationEvent,
  paymentIntentIdFromReconciliationEvent,
  resolveStripeLicenseStatus,
  resolveUaStudentLicenseAccess,
  verifyCheckoutSessionForReturn,
} from './student-license.server';

const enabledEnv = {
  UA_STUDENT_BILLING_ENABLED: 'true',
  UA_ORGANIZATION_ID: 'org-ua',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  STRIPE_UA_2026_PRICE_ID: 'price_ua_2026',
  STRIPE_UA_PRODUCTION_TEST_PROMOTION_CODE_ID: 'promo_ua_production_test',
  UA_PARTNER_HOSTNAME: 'ua.yawp.school',
  YAWP_APP_ORIGIN: 'https://ua.yawp.school',
};

describe('UA student license configuration', () => {
  test('verifies Stripe webhook signatures with Bun-compatible async crypto', async () => {
    const stripe = new Stripe('sk_test_example');
    const payload = JSON.stringify({
      id: 'evt_async_crypto',
      object: 'event',
      type: 'checkout.session.completed',
    });
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: enabledEnv.STRIPE_WEBHOOK_SECRET,
    });

    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      enabledEnv.STRIPE_WEBHOOK_SECRET
    );

    expect(event.id).toBe('evt_async_crypto');
  });

  test('defaults the feature off without requiring Stripe credentials', () => {
    expect(getUaStudentLicenseConfig({})).toEqual({ enabled: false });
  });

  test('requires all server configuration when enabled', () => {
    expect(() =>
      getUaStudentLicenseConfig({ UA_STUDENT_BILLING_ENABLED: 'true' })
    ).toThrow('Invalid UA student billing configuration');
  });

  test('accepts only Stripe Promotion Code object IDs for the production test code', () => {
    expect(
      getUaStudentLicenseConfig({
        ...enabledEnv,
        STRIPE_UA_PRODUCTION_TEST_PROMOTION_CODE_ID: undefined,
      })
    ).not.toHaveProperty('productionTestPromotionCodeId');
    expect(() =>
      getUaStudentLicenseConfig({
        ...enabledEnv,
        STRIPE_UA_PRODUCTION_TEST_PROMOTION_CODE_ID: 'the-customer-facing-code',
      })
    ).toThrow('Invalid UA student billing configuration');
  });

  test('requires a canonical application origin without a path', () => {
    expect(getUaStudentLicenseConfig(enabledEnv)).toMatchObject({
      enabled: true,
      applicationOrigin: 'https://ua.yawp.school',
      productionTestPromotionCodeId: 'promo_ua_production_test',
    });
    expect(() =>
      getUaStudentLicenseConfig({
        ...enabledEnv,
        YAWP_APP_ORIGIN: 'https://yawp.school/untrusted-path',
      })
    ).toThrow('Invalid UA student billing configuration');
    expect(() =>
      getUaStudentLicenseConfig({
        ...enabledEnv,
        YAWP_APP_ORIGIN: 'https://yawp.school',
      })
    ).toThrow('Invalid UA student billing configuration');
    expect(() =>
      getUaStudentLicenseConfig({
        ...enabledEnv,
        YAWP_APP_ORIGIN: 'file:///',
      })
    ).toThrow('Invalid UA student billing configuration');
  });

  test('allows a loopback Stripe API override only in E2E', () => {
    expect(
      getE2EStripeClientOptions({
        E2E: 'true',
        E2E_STRIPE_API_BASE: 'http://127.0.0.1:12111',
      })
    ).toEqual({ host: '127.0.0.1', port: 12111, protocol: 'http' });
    expect(
      getE2EStripeClientOptions({
        E2E: 'false',
        E2E_STRIPE_API_BASE: 'http://127.0.0.1:12111',
      })
    ).toBeNull();
    expect(() =>
      getE2EStripeClientOptions({
        E2E: 'true',
        E2E_STRIPE_API_BASE: 'https://stripe-proxy.example.com',
      })
    ).toThrow('Invalid E2E Stripe API base');
  });

  test('uses a deterministic UA clock only in E2E', () => {
    expect(
      getUaStudentLicenseNow({
        E2E: 'true',
        E2E_UA_NOW: '2026-08-30T12:00:00.000Z',
      }).toISOString()
    ).toBe('2026-08-30T12:00:00.000Z');
    expect(() =>
      getUaStudentLicenseNow({ E2E: 'true', E2E_UA_NOW: 'not-a-date' })
    ).toThrow('Invalid E2E UA clock');
  });

  test('rejects Stripe test-mode prices and events in production', () => {
    expect(() =>
      assertStripeModeAllowed(true, { NODE_ENV: 'production' })
    ).not.toThrow();
    expect(() =>
      assertStripeModeAllowed(false, { NODE_ENV: 'production' })
    ).toThrow('Stripe test-mode data is not allowed in production');
    expect(() =>
      assertStripeModeAllowed(false, { NODE_ENV: 'development' })
    ).not.toThrow();
    expect(() =>
      assertStripeModeAllowed(false, {
        NODE_ENV: 'production',
        YAWP_ENVIRONMENT: 'preview',
      })
    ).not.toThrow();
    expect(() =>
      assertStripeModeAllowed(false, {
        NODE_ENV: 'production',
        YAWP_ENVIRONMENT: 'production',
      })
    ).toThrow('Stripe test-mode data is not allowed in production');
  });
});

describe('UA student license access', () => {
  const config = getUaStudentLicenseConfig(enabledEnv);

  test('bypasses teachers and students from other organizations', () => {
    expect(
      resolveUaStudentLicenseAccess({
        config,
        membership: {
          id: 'teacher',
          role: 'TEACHER',
          organizationId: 'org-ua',
        },
        entitlement: null,
        now: new Date('2026-09-01T00:00:00.000Z'),
      })
    ).toBe('BYPASS');

    expect(
      resolveUaStudentLicenseAccess({
        config,
        membership: {
          id: 'student',
          role: 'STUDENT',
          organizationId: 'org-other',
        },
        entitlement: null,
        now: new Date('2026-09-01T00:00:00.000Z'),
      })
    ).toBe('BYPASS');
  });

  test('requires payment only for the configured UA student cohort', () => {
    expect(
      resolveUaStudentLicenseAccess({
        config,
        membership: {
          id: 'student',
          role: 'STUDENT',
          organizationId: 'org-ua',
        },
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
          membership: {
            id: 'student',
            role: 'STUDENT',
            organizationId: 'org-ua',
          },
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
        membership: {
          id: 'student',
          role: 'STUDENT',
          organizationId: 'org-ua',
        },
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
          membership: {
            id: 'student',
            role: 'STUDENT',
            organizationId: 'org-ua',
          },
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

describe('Checkout return verification', () => {
  test('retrieves and verifies Stripe state without activating a license', async () => {
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
    const dependencies = {
      retrieveCheckoutSession: retrieve,
      findMembership,
    };

    const first = await verifyCheckoutSessionForReturn('cs_paid', {
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies,
    });

    expect(first).toMatchObject({ membershipId: 'membership-1' });
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  test('accepts a fully discounted Stripe Checkout without a PaymentIntent', async () => {
    const retrieve = mock().mockResolvedValue({
      id: 'cs_free',
      status: 'complete',
      mode: 'payment',
      payment_status: 'no_payment_required',
      amount_subtotal: 5000,
      amount_total: 0,
      currency: 'usd',
      customer: 'cus_free',
      payment_intent: null,
      total_details: { amount_discount: 5000 },
      discounts: [{ promotion_code: 'promo_ua_production_test' }],
      metadata: {
        membershipId: 'membership-free',
        organizationId: 'org-ua',
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
      line_items: {
        data: [{ price: { id: 'price_ua_2026' }, quantity: 1 }],
      },
    });
    const findMembership = mock().mockResolvedValue({
      id: 'membership-free',
      organizationId: 'org-ua',
      role: 'STUDENT',
    });

    await expect(
      verifyCheckoutSessionForReturn('cs_free', {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: retrieve,
          findMembership,
        },
      })
    ).resolves.toEqual({ membershipId: 'membership-free' });
  });

  test('rejects zero-total Checkout sessions without the full configured discount', async () => {
    const invalidFreeSession = {
      id: 'cs_invalid_free',
      status: 'complete',
      mode: 'payment',
      payment_status: 'no_payment_required',
      amount_subtotal: 5000,
      amount_total: 0,
      currency: 'usd',
      customer: 'cus_free',
      payment_intent: null,
      total_details: { amount_discount: 4900 },
      discounts: [{ promotion_code: 'promo_ua_production_test' }],
      metadata: {
        membershipId: 'membership-free',
        organizationId: 'org-ua',
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
      line_items: {
        data: [{ price: { id: 'price_ua_2026' }, quantity: 1 }],
      },
    };

    await expect(
      verifyCheckoutSessionForReturn('cs_invalid_free', {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: mock().mockResolvedValue(invalidFreeSession),
          findMembership: mock(),
        },
      })
    ).rejects.toThrow('Checkout Session does not match the UA license');
  });

  test('rejects a fully discounted Session from a different promotion code', async () => {
    const wrongPromotion = {
      id: 'cs_wrong_promotion',
      status: 'complete',
      mode: 'payment',
      payment_status: 'no_payment_required',
      amount_subtotal: 5000,
      amount_total: 0,
      currency: 'usd',
      customer: 'cus_free',
      payment_intent: null,
      total_details: { amount_discount: 5000 },
      discounts: [{ promotion_code: 'promo_someone_else' }],
      metadata: {
        membershipId: 'membership-free',
        organizationId: 'org-ua',
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
      line_items: {
        data: [{ price: { id: 'price_ua_2026' }, quantity: 1 }],
      },
    };

    await expect(
      verifyCheckoutSessionForReturn(wrongPromotion.id, {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: mock().mockResolvedValue(wrongPromotion),
          findMembership: mock(),
        },
      })
    ).rejects.toThrow('Checkout Session does not match the UA license');
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
    await expect(
      verifyCheckoutSessionForReturn('cs_bad', {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: mock().mockResolvedValue(base),
          findMembership: mock(),
        },
      })
    ).rejects.toThrow('Checkout Session is not paid');

    await expect(
      verifyCheckoutSessionForReturn('cs_bad', {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: mock().mockResolvedValue({
            ...base,
            payment_status: 'paid',
            amount_total: 4900,
          }),
          findMembership: mock(),
        },
      })
    ).rejects.toThrow('Checkout Session does not match the UA license');
  });

  test('fails closed for every Checkout identity, amount, price, and ownership mismatch', async () => {
    const valid = {
      id: 'cs_valid_shape',
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
        data: [{ price: { id: 'price_ua_2026' }, quantity: 1 }],
      },
    };
    const mismatches = [
      { ...valid, mode: 'subscription' },
      { ...valid, currency: 'eur' },
      { ...valid, payment_intent: null },
      {
        ...valid,
        metadata: { ...valid.metadata, organizationId: 'other-org' },
      },
      { ...valid, metadata: { ...valid.metadata, cohort: 'other-cohort' } },
      { ...valid, metadata: { ...valid.metadata, membershipId: '' } },
      {
        ...valid,
        line_items: { data: [{ price: { id: 'wrong-price' }, quantity: 1 }] },
      },
      {
        ...valid,
        line_items: {
          data: [{ price: { id: 'price_ua_2026' }, quantity: 2 }],
        },
      },
      {
        ...valid,
        line_items: {
          data: [
            { price: { id: 'price_ua_2026' }, quantity: 1 },
            { price: { id: 'extra-price' }, quantity: 1 },
          ],
        },
      },
    ];

    for (const session of mismatches) {
      await expect(
        verifyCheckoutSessionForReturn(session.id, {
          config: getUaStudentLicenseConfig(enabledEnv),
          dependencies: {
            retrieveCheckoutSession: mock().mockResolvedValue(session),
            findMembership: mock(),
          },
        })
      ).rejects.toThrow('Checkout Session does not match the UA license');
    }

    await expect(
      verifyCheckoutSessionForReturn(valid.id, {
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          retrieveCheckoutSession: mock().mockResolvedValue(valid),
          findMembership: mock().mockResolvedValue(null),
        },
      })
    ).rejects.toThrow('Checkout Session membership is not eligible');
  });
});

describe('Checkout creation', () => {
  test('rejects an unrecognized production-test code before creating a Checkout Session', async () => {
    const findOrCreateLicense = mock();
    const createCheckoutSession = mock();
    const validateProductionTestPromotionCode = mock().mockResolvedValue(null);

    const result = await createOrReuseCheckoutSession({
      membershipId: 'membership-1',
      successUrl: 'https://ua.yawp.school/billing/ua/success',
      cancelUrl: 'https://ua.yawp.school/billing/ua?canceled=1',
      productionTestCode: 'wrong-code',
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies: {
        findMembership: mock().mockResolvedValue({
          id: 'membership-1',
          role: 'STUDENT',
          organizationId: 'org-ua',
          user: { email: 'student@example.com' },
        }),
        findOrCreateLicense,
        validateConfiguredPrice: mock().mockResolvedValue({
          productId: 'prod_ua',
          livemode: false,
        }),
        validateProductionTestPromotionCode,
        retrieveCheckoutSession: mock(),
        expireCheckoutSession: mock(),
        prepareAttempt: mock(),
        createCheckoutSession,
        attachCheckoutSession: mock(),
      },
    });

    expect(result).toEqual({ kind: 'INVALID_PROMOTION_CODE' });
    expect(validateProductionTestPromotionCode).toHaveBeenCalledWith({
      code: 'wrong-code',
      productId: 'prod_ua',
      livemode: false,
    });
    expect(findOrCreateLicense).not.toHaveBeenCalled();
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('applies only the configured promotion ID after server-side code validation', async () => {
    const createCheckoutSession = mock().mockResolvedValue({
      id: 'cs_free',
      url: 'https://checkout.stripe.test/cs_free',
    });

    const result = await createOrReuseCheckoutSession({
      membershipId: 'membership-1',
      successUrl: 'https://ua.yawp.school/billing/ua/success',
      cancelUrl: 'https://ua.yawp.school/billing/ua?canceled=1',
      productionTestCode: 'correct-high-entropy-code',
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies: {
        findMembership: mock().mockResolvedValue({
          id: 'membership-1',
          role: 'STUDENT',
          organizationId: 'org-ua',
          user: { email: 'student@example.com' },
        }),
        findOrCreateLicense: mock().mockResolvedValue({
          id: 'license-1',
          status: 'PENDING',
          validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          checkoutAttempt: 0,
          stripeCheckoutSessionId: null,
        }),
        validateConfiguredPrice: mock().mockResolvedValue({
          productId: 'prod_ua',
          livemode: false,
        }),
        validateProductionTestPromotionCode: mock().mockResolvedValue(
          'promo_ua_production_test'
        ),
        retrieveCheckoutSession: mock(),
        expireCheckoutSession: mock(),
        prepareAttempt: mock().mockResolvedValue(0),
        createCheckoutSession,
        attachCheckoutSession: mock(),
      },
    });

    expect(result).toEqual({
      kind: 'CHECKOUT',
      url: 'https://checkout.stripe.test/cs_free',
    });
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        promotionCodeId: 'promo_ua_production_test',
      })
    );
  });

  test('rejects a misconfigured Stripe price before opening Checkout', async () => {
    const createCheckoutSession = mock();
    await expect(
      createOrReuseCheckoutSession({
        membershipId: 'membership-1',
        successUrl: 'https://ua.yawp.school/billing/ua/success',
        cancelUrl: 'https://ua.yawp.school/billing/ua?canceled=1',
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          findMembership: mock().mockResolvedValue({
            id: 'membership-1',
            role: 'STUDENT',
            organizationId: 'org-ua',
            user: { email: 'student@example.com' },
          }),
          findOrCreateLicense: mock().mockResolvedValue({
            id: 'license-1',
            status: 'PENDING',
            validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
            checkoutAttempt: 0,
            stripeCheckoutSessionId: null,
          }),
          validateConfiguredPrice: mock().mockRejectedValue(
            new Error(
              'Configured Stripe price must be active, one-time, USD 50'
            )
          ),
          retrieveCheckoutSession: mock(),
          prepareAttempt: mock(),
          createCheckoutSession,
          attachCheckoutSession: mock(),
        },
      })
    ).rejects.toThrow('Configured Stripe price');
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('reuses the existing open Checkout Session without creating a second payable Session', async () => {
    const createCheckoutSession = mock();
    const prepareAttempt = mock();
    const result = await createOrReuseCheckoutSession({
      membershipId: 'membership-1',
      successUrl: 'https://yawp.school/billing/ua/success',
      cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies: {
        findMembership: mock().mockResolvedValue({
          id: 'membership-1',
          role: 'STUDENT',
          organizationId: 'org-ua',
          user: { email: 'student@example.com' },
        }),
        findOrCreateLicense: mock().mockResolvedValue({
          id: 'license-1',
          status: 'PENDING',
          validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          checkoutAttempt: 0,
          stripeCheckoutSessionId: 'cs_open',
        }),
        retrieveCheckoutSession: mock().mockResolvedValue({
          id: 'cs_open',
          status: 'open',
          payment_status: 'unpaid',
          url: 'https://checkout.stripe.test/cs_open',
        }),
        prepareAttempt,
        createCheckoutSession,
        attachCheckoutSession: mock(),
      },
    });

    expect(result).toEqual({
      kind: 'CHECKOUT',
      url: 'https://checkout.stripe.test/cs_open',
    });
    expect(prepareAttempt).not.toHaveBeenCalled();
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('parallel first attempts share one Stripe idempotency key', async () => {
    const membership = {
      id: 'membership-1',
      role: 'STUDENT',
      organizationId: 'org-ua',
      user: { email: 'student@example.com' },
    };
    const license = {
      id: 'license-1',
      status: 'PENDING',
      validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
      checkoutAttempt: 0,
      stripeCheckoutSessionId: null,
    };
    const createCheckoutSession = mock().mockResolvedValue({
      id: 'cs_shared',
      url: 'https://checkout.stripe.test/cs_shared',
    });
    const dependencies = {
      findMembership: mock().mockResolvedValue(membership),
      findOrCreateLicense: mock().mockResolvedValue(license),
      retrieveCheckoutSession: mock(),
      prepareAttempt: mock().mockResolvedValue(0),
      createCheckoutSession,
      attachCheckoutSession: mock(),
    };

    await Promise.all([
      createOrReuseCheckoutSession({
        membershipId: membership.id,
        successUrl: 'https://yawp.school/billing/ua/success',
        cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies,
      }),
      createOrReuseCheckoutSession({
        membershipId: membership.id,
        successUrl: 'https://yawp.school/billing/ua/success',
        cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies,
      }),
    ]);

    expect(createCheckoutSession).toHaveBeenCalledTimes(2);
    expect(createCheckoutSession.mock.calls[0]?.[0]).toMatchObject({
      attempt: 0,
      idempotencyKey: 'ua-2026:license-1',
    });
    expect(createCheckoutSession.mock.calls[1]?.[0]).toMatchObject({
      attempt: 0,
      idempotencyKey: 'ua-2026:license-1',
    });
  });

  test('never reuses a refunded/revoked Session and starts a new attempt', async () => {
    const membership = {
      id: 'membership-1',
      role: 'STUDENT',
      organizationId: 'org-ua',
      user: { email: 'student@example.com' },
    };
    for (const status of ['REFUNDED', 'REVOKED']) {
      const retrieveCheckoutSession = mock();
      const createCheckoutSession = mock().mockResolvedValue({
        id: `cs_retry_${status}`,
        url: `https://checkout.stripe.test/retry-${status}`,
      });
      const result = await createOrReuseCheckoutSession({
        membershipId: membership.id,
        successUrl: 'https://yawp.school/billing/ua/success',
        cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          findMembership: mock().mockResolvedValue(membership),
          findOrCreateLicense: mock().mockResolvedValue({
            id: 'license-1',
            status,
            validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
            checkoutAttempt: 3,
            stripeCheckoutSessionId: 'cs_terminal_old',
          }),
          retrieveCheckoutSession,
          prepareAttempt: mock().mockResolvedValue(4),
          createCheckoutSession,
          attachCheckoutSession: mock(),
        },
      });

      expect(result).toEqual({
        kind: 'CHECKOUT',
        url: `https://checkout.stripe.test/retry-${status}`,
      });
      expect(retrieveCheckoutSession).not.toHaveBeenCalled();
      expect(createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 4 })
      );
    }
  });

  test('suspends Checkout while a dispute remains unresolved', async () => {
    const retrieveCheckoutSession = mock();
    const prepareAttempt = mock();
    const createCheckoutSession = mock();
    const result = await createOrReuseCheckoutSession({
      membershipId: 'membership-1',
      successUrl: 'https://yawp.school/billing/ua/success',
      cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies: {
        findMembership: mock().mockResolvedValue({
          id: 'membership-1',
          role: 'STUDENT',
          organizationId: 'org-ua',
          user: { email: 'student@example.com' },
        }),
        findOrCreateLicense: mock().mockResolvedValue({
          id: 'license-1',
          status: 'DISPUTED',
          validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          checkoutAttempt: 2,
          stripeCheckoutSessionId: 'cs_disputed',
        }),
        retrieveCheckoutSession,
        prepareAttempt,
        createCheckoutSession,
        attachCheckoutSession: mock(),
      },
    });

    expect(result).toEqual({ kind: 'SUSPENDED' });
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
    expect(prepareAttempt).not.toHaveBeenCalled();
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('waits for the signed webhook instead of re-fulfilling a completed Session', async () => {
    const createCheckoutSession = mock();
    const result = await createOrReuseCheckoutSession({
      membershipId: 'membership-1',
      successUrl: 'https://yawp.school/billing/ua/success',
      cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies: {
        findMembership: mock().mockResolvedValue({
          id: 'membership-1',
          role: 'STUDENT',
          organizationId: 'org-ua',
          user: { email: 'student@example.com' },
        }),
        findOrCreateLicense: mock().mockResolvedValue({
          id: 'license-1',
          status: 'PENDING',
          validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          checkoutAttempt: 0,
          stripeCheckoutSessionId: 'cs_paid',
        }),
        retrieveCheckoutSession: mock().mockResolvedValue({
          id: 'cs_paid',
          status: 'complete',
          payment_status: 'paid',
          url: null,
        }),
        prepareAttempt: mock(),
        createCheckoutSession,
        attachCheckoutSession: mock(),
      },
    });

    expect(result).toEqual({ kind: 'PROCESSING' });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('waits for the signed webhook after a completed zero-cost Session', async () => {
    const createCheckoutSession = mock();
    const result = await createOrReuseCheckoutSession({
      membershipId: 'membership-1',
      successUrl: 'https://yawp.school/billing/ua/success',
      cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
      config: getUaStudentLicenseConfig(enabledEnv),
      dependencies: {
        findMembership: mock().mockResolvedValue({
          id: 'membership-1',
          role: 'STUDENT',
          organizationId: 'org-ua',
          user: { email: 'student@example.com' },
        }),
        findOrCreateLicense: mock().mockResolvedValue({
          id: 'license-1',
          status: 'PENDING',
          validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
          checkoutAttempt: 0,
          stripeCheckoutSessionId: 'cs_free',
        }),
        retrieveCheckoutSession: mock().mockResolvedValue({
          id: 'cs_free',
          status: 'complete',
          payment_status: 'no_payment_required',
          url: null,
        }),
        prepareAttempt: mock(),
        createCheckoutSession,
        attachCheckoutSession: mock(),
      },
    });

    expect(result).toEqual({ kind: 'PROCESSING' });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test('closes sales at the exclusive license cutoff', async () => {
    const findOrCreateLicense = mock();
    expect(
      isUaStudentLicenseSalesClosed(new Date('2027-01-01T05:59:59.999Z'))
    ).toBe(false);
    expect(isUaStudentLicenseSalesClosed(UA_STUDENT_LICENSE_VALID_UNTIL)).toBe(
      true
    );

    const result = await createOrReuseCheckoutSession({
      membershipId: 'membership-1',
      successUrl: 'https://yawp.school/billing/ua/success',
      cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
      config: getUaStudentLicenseConfig(enabledEnv),
      now: UA_STUDENT_LICENSE_VALID_UNTIL,
      dependencies: {
        findMembership: mock().mockResolvedValue({
          id: 'membership-1',
          role: 'STUDENT',
          organizationId: 'org-ua',
          user: { email: 'student@example.com' },
        }),
        findOrCreateLicense,
        retrieveCheckoutSession: mock(),
        prepareAttempt: mock(),
        createCheckoutSession: mock(),
        attachCheckoutSession: mock(),
      },
    });
    expect(result).toEqual({ kind: 'CLOSED' });
    expect(findOrCreateLicense).not.toHaveBeenCalled();
  });

  test('fails closed when Stripe omits the hosted Checkout URL', async () => {
    await expect(
      createOrReuseCheckoutSession({
        membershipId: 'membership-1',
        successUrl: 'https://yawp.school/billing/ua/success',
        cancelUrl: 'https://yawp.school/billing/ua?canceled=1',
        config: getUaStudentLicenseConfig(enabledEnv),
        dependencies: {
          findMembership: mock().mockResolvedValue({
            id: 'membership-1',
            role: 'STUDENT',
            organizationId: 'org-ua',
            user: { email: 'student@example.com' },
          }),
          findOrCreateLicense: mock().mockResolvedValue({
            id: 'license-1',
            status: 'PENDING',
            validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
            checkoutAttempt: 0,
            stripeCheckoutSessionId: null,
          }),
          retrieveCheckoutSession: mock(),
          prepareAttempt: mock().mockResolvedValue(0),
          createCheckoutSession: mock().mockResolvedValue({
            id: 'cs_without_url',
            url: null,
          }),
          attachCheckoutSession: mock(),
        },
      })
    ).rejects.toThrow('Stripe did not return a Checkout URL');
  });
});

describe('durable Stripe webhook transitions', () => {
  const activePayment = {
    paymentIntentStatus: 'succeeded',
    charge: {
      paid: true,
      amount: 5000,
      amountRefunded: 0,
      currency: 'usd',
      disputed: false,
    },
    disputeStatuses: [] as string[],
  };

  test('records the event and current-state reconciliation in one transaction', async () => {
    const recordEvent = mock();
    const lockPaymentIntent = mock();
    const reconcile = mock();
    const transaction = mock(async (work: (tx: any) => Promise<void>) =>
      work({ recordEvent, lockPaymentIntent, reconcile })
    );

    const result = await applyStripeWebhookTransition(
      {
        eventId: 'evt_checkout',
        eventType: 'checkout.session.completed',
        transition: {
          kind: 'RECONCILE',
          paymentIntentId: 'pi_paid',
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
      {
        transaction,
        eventExists: mock().mockResolvedValue(false),
        retrievePaymentSnapshot: mock().mockResolvedValue(activePayment),
      }
    );

    expect(result).toEqual({ duplicate: false, handled: true });
    expect(recordEvent).toHaveBeenCalledWith(
      'evt_checkout',
      'checkout.session.completed'
    );
    expect(lockPaymentIntent).toHaveBeenCalledWith('pi_paid');
    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCheckoutSessionId: 'cs_paid' }),
      'pi_paid',
      'ACTIVE'
    );
  });

  test('activates a signed zero-cost Checkout without querying a PaymentIntent', async () => {
    const recordEvent = mock();
    const lockPaymentIntent = mock();
    const reconcile = mock();
    const retrievePaymentSnapshot = mock();
    const transaction = mock(async (work: (tx: any) => Promise<void>) =>
      work({ recordEvent, lockPaymentIntent, reconcile })
    );
    const checkout = {
      membershipId: 'membership-free',
      organizationId: 'org-ua',
      stripeCheckoutSessionId: 'cs_free',
      stripePaymentIntentId: null,
      stripeCustomerId: 'cus_free',
      stripePriceId: 'price_ua_2026',
      cohort: UA_STUDENT_LICENSE_COHORT,
      amountPaid: 0,
      currency: 'usd' as const,
      validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
    };

    const result = await applyStripeWebhookTransition(
      {
        eventId: 'evt_free_checkout',
        eventType: 'checkout.session.completed',
        transition: { kind: 'ACTIVATE_FREE_CHECKOUT', checkout },
      } as any,
      {
        transaction,
        eventExists: mock().mockResolvedValue(false),
        retrievePaymentSnapshot,
      }
    );

    expect(result).toEqual({ duplicate: false, handled: true });
    expect(recordEvent).toHaveBeenCalledWith(
      'evt_free_checkout',
      'checkout.session.completed'
    );
    expect(lockPaymentIntent).toHaveBeenCalledWith('cs_free');
    expect(retrievePaymentSnapshot).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledWith(checkout, null, 'ACTIVE');
  });

  test('treats a duplicate event id as success without repeating the transition', async () => {
    const reconcile = mock();
    const transaction = mock(async (work: (tx: any) => Promise<void>) =>
      work({
        recordEvent: mock(() => {
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }),
        lockPaymentIntent: mock(),
        reconcile,
      })
    );

    const result = await applyStripeWebhookTransition(
      {
        eventId: 'evt_duplicate',
        eventType: 'checkout.session.completed',
        transition: { kind: 'IGNORE' },
      },
      {
        transaction,
        eventExists: mock().mockResolvedValue(true),
        retrievePaymentSnapshot: mock(),
      }
    );

    expect(result).toEqual({ duplicate: true, handled: false });
    expect(reconcile).not.toHaveBeenCalled();
  });

  test('rethrows P2002 from another unique constraint', async () => {
    const error = Object.assign(new Error('different unique constraint'), {
      code: 'P2002',
    });
    const transaction = mock().mockRejectedValue(error);

    await expect(
      applyStripeWebhookTransition(
        {
          eventId: 'evt_not_recorded',
          eventType: 'checkout.session.completed',
          transition: { kind: 'IGNORE' },
        },
        {
          transaction,
          eventExists: mock().mockResolvedValue(false),
          retrievePaymentSnapshot: mock(),
        }
      )
    ).rejects.toBe(error);
  });

  test('reconciles refunds and disputes by PaymentIntent id', async () => {
    const reconcile = mock();
    const transaction = mock(async (work: (tx: any) => Promise<void>) =>
      work({
        recordEvent: mock(),
        lockPaymentIntent: mock(),
        reconcile,
      })
    );

    await applyStripeWebhookTransition(
      {
        eventId: 'evt_refund',
        eventType: 'charge.refunded',
        transition: {
          kind: 'RECONCILE',
          paymentIntentId: 'pi_refunded',
          checkout: null,
        },
      },
      {
        transaction,
        eventExists: mock().mockResolvedValue(false),
        retrievePaymentSnapshot: mock().mockResolvedValue({
          ...activePayment,
          charge: { ...activePayment.charge, amountRefunded: 5000 },
        }),
      }
    );

    expect(reconcile).toHaveBeenCalledWith(null, 'pi_refunded', 'REFUNDED');
  });

  test('serializes concurrent snapshots so stale ACTIVE cannot commit after REFUNDED', async () => {
    let lockTail = Promise.resolve();
    let finalStatus = 'UNSET';
    let releaseDelayedActive!: () => void;
    const delayedActive = new Promise<void>((resolve) => {
      releaseDelayedActive = resolve;
    });
    const transaction = async (work: (tx: any) => Promise<void>) => {
      let unlock = () => {};
      let locked = false;
      let pendingStatus: string | null = null;
      try {
        await work({
          recordEvent: mock(),
          async lockPaymentIntent() {
            const prior = lockTail;
            lockTail = new Promise<void>((resolve) => {
              unlock = resolve;
            });
            await prior;
            locked = true;
          },
          reconcile(
            _checkout: unknown,
            _paymentIntentId: string,
            status: string
          ) {
            pendingStatus = status;
          },
        });
        if (pendingStatus === 'ACTIVE') await delayedActive;
        finalStatus = pendingStatus ?? 'MISSING';
      } finally {
        if (locked) unlock();
      }
    };
    const retrievePaymentSnapshot = mock()
      .mockResolvedValueOnce(activePayment)
      .mockResolvedValueOnce({
        ...activePayment,
        charge: { ...activePayment.charge, amountRefunded: 5000 },
      });
    const dependencies = {
      transaction,
      eventExists: mock().mockResolvedValue(false),
      retrievePaymentSnapshot,
    };
    const activeHandler = applyStripeWebhookTransition(
      {
        eventId: 'evt_active_race',
        eventType: 'checkout.session.completed',
        transition: {
          kind: 'RECONCILE',
          paymentIntentId: 'pi_race',
          checkout: null,
        },
      },
      dependencies
    );
    const refundHandler = applyStripeWebhookTransition(
      {
        eventId: 'evt_refund_race',
        eventType: 'charge.refunded',
        transition: {
          kind: 'RECONCILE',
          paymentIntentId: 'pi_race',
          checkout: null,
        },
      },
      dependencies
    );

    setTimeout(releaseDelayedActive, 0);
    await Promise.all([activeHandler, refundHandler]);

    expect(retrievePaymentSnapshot).toHaveBeenCalledTimes(2);
    expect(finalStatus).toBe('REFUNDED');
  });
});

describe('Stripe payment state reconciliation', () => {
  const paidSnapshot = {
    paymentIntentStatus: 'succeeded',
    charge: {
      paid: true,
      amount: 5000,
      amountRefunded: 0,
      currency: 'usd',
      disputed: false,
    },
    disputeStatuses: [] as string[],
  };

  test('is order-safe because current full refunds and disputes override old completion events', () => {
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        charge: { ...paidSnapshot.charge, amountRefunded: 5000 },
      })
    ).toBe('REFUNDED');
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        charge: { ...paidSnapshot.charge, disputed: true },
        disputeStatuses: ['under_review'],
      })
    ).toBe('DISPUTED');
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        disputeStatuses: ['lost'],
      })
    ).toBe('REVOKED');
  });

  test('restores a won dispute only while the payment and retained funds qualify', () => {
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        disputeStatuses: ['won'],
      })
    ).toBe('ACTIVE');
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        disputeStatuses: ['warning_closed'],
      })
    ).toBe('ACTIVE');
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        disputeStatuses: ['prevented'],
      })
    ).toBe('ACTIVE');
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        paymentIntentStatus: 'canceled',
        disputeStatuses: ['won'],
      })
    ).toBe('REVOKED');
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        charge: { ...paidSnapshot.charge, amountRefunded: 5000 },
        disputeStatuses: ['won'],
      })
    ).toBe('REFUNDED');
  });

  test('keeps access after a partial refund by explicit policy', () => {
    expect(
      resolveStripeLicenseStatus({
        ...paidSnapshot,
        charge: { ...paidSnapshot.charge, amountRefunded: 2500 },
      })
    ).toBe('ACTIVE');
  });

  test('reconciles funds-reinstated webhooks against the current PaymentIntent', () => {
    const event = {
      type: 'charge.dispute.funds_reinstated',
      data: { object: { payment_intent: 'pi_reinstated' } },
    } as any;
    expect(isStripePaymentReconciliationEvent(event.type)).toBe(true);
    expect(paymentIntentIdFromReconciliationEvent(event)).toBe('pi_reinstated');
  });

  test('revokes access for every non-successful or structurally invalid payment snapshot', () => {
    const invalidSnapshots = [
      { ...paidSnapshot, paymentIntentStatus: 'processing' },
      { ...paidSnapshot, charge: null },
      { ...paidSnapshot, charge: { ...paidSnapshot.charge, paid: false } },
      { ...paidSnapshot, charge: { ...paidSnapshot.charge, amount: 4900 } },
      { ...paidSnapshot, charge: { ...paidSnapshot.charge, currency: 'eur' } },
    ];

    for (const snapshot of invalidSnapshots) {
      expect(resolveStripeLicenseStatus(snapshot)).toBe('REVOKED');
    }
  });
});
