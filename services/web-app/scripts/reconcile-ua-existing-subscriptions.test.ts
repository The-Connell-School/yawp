import { describe, expect, mock, test } from 'bun:test';
import {
  parseAllowedPriceIds,
  parseReconciliationInput,
  reconcileUaExistingSubscriptions,
  type ExistingSubscriptionLicensePlan,
  type LicenseSnapshot,
  type ReconciliationDependencies,
} from './reconcile-ua-existing-subscriptions';

const config = {
  organizationId: 'org-ua',
  allowedPriceIds: new Set(['price_qualifying']),
  cohort: 'ua-2026',
  validUntil: new Date('2027-01-01T06:00:00.000Z'),
};

function makeDependencies({
  memberships = [{ id: 'membership-1', organizationId: 'org-ua' }],
  existingLicense = null as LicenseSnapshot,
} = {}) {
  const applied: ExistingSubscriptionLicensePlan[][] = [];
  const subscriptionOwners = new Map<
    string,
    { membershipId: string; cohort: string }
  >();
  const dependencies: ReconciliationDependencies = {
    retrieveSubscription: mock(async (id: string) => ({
      id,
      status: 'active',
      customer: 'cus_existing',
      items: [{ priceId: 'price_qualifying', currency: 'USD' }],
    })),
    findActiveStudentMemberships: mock(async () => memberships),
    findLicense: mock(async () => existingLicense),
    findLicenseBySubscriptionId: mock(
      async (subscriptionId) => subscriptionOwners.get(subscriptionId) ?? null
    ),
    applyExistingSubscriptionLicenses: mock(async (plans) => {
      applied.push(plans);
      for (const plan of plans) {
        subscriptionOwners.set(plan.subscriptionId, {
          membershipId: plan.membershipId,
          cohort: plan.cohort,
        });
      }
      existingLicense = {
        source: 'EXISTING_SUBSCRIPTION',
        status: 'ACTIVE',
        stripeSubscriptionId: plans[0]?.subscriptionId ?? null,
      };
    }),
  };
  return { dependencies, applied, subscriptionOwners };
}

describe('existing subscription input validation', () => {
  test('normalizes email and requires explicit Stripe subscription IDs', () => {
    expect(
      parseReconciliationInput(
        JSON.stringify({ ' Student@Example.edu ': ' sub_123ABC ' })
      )
    ).toEqual([{ email: 'student@example.edu', subscriptionId: 'sub_123ABC' }]);

    expect(() =>
      parseReconciliationInput(JSON.stringify({ 'not-an-email': 'sub_123' }))
    ).toThrow('Invalid student email');
    expect(() =>
      parseReconciliationInput(
        JSON.stringify({ 'student@example.edu': 'cus_123' })
      )
    ).toThrow('Invalid subscription ID');
  });

  test('fails closed on normalized email or subscription duplication', () => {
    expect(() =>
      parseReconciliationInput(
        '{"Student@Example.edu":"sub_1","student@example.edu":"sub_2"}'
      )
    ).toThrow('Duplicate normalized student email');
    expect(() =>
      parseReconciliationInput(
        '{"one@example.edu":"sub_1","two@example.edu":"sub_1"}'
      )
    ).toThrow('Subscription is mapped more than once');
  });

  test('requires configured Stripe price IDs', () => {
    expect(parseAllowedPriceIds('price_one, price_two')).toEqual(
      new Set(['price_one', 'price_two'])
    );
    expect(() => parseAllowedPriceIds('')).toThrow(
      'STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS'
    );
    expect(() => parseAllowedPriceIds('prod_not_a_price')).toThrow(
      'STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS'
    );
  });
});

describe('existing subscription reconciliation', () => {
  const input = [{ email: 'student@example.edu', subscriptionId: 'sub_123' }];

  test('fails closed when membership lookup is ambiguous', async () => {
    const { dependencies } = makeDependencies({
      memberships: [
        { id: 'membership-1', organizationId: 'org-ua' },
        { id: 'membership-2', organizationId: 'org-ua' },
      ],
    });

    await expect(
      reconcileUaExistingSubscriptions({ input, config, dependencies })
    ).rejects.toThrow('Expected exactly one active UA student membership');
    expect(
      dependencies.applyExistingSubscriptionLicenses
    ).not.toHaveBeenCalled();
  });

  test('fails closed on subscription status, price, or conflicting license', async () => {
    const inactive = makeDependencies().dependencies;
    inactive.retrieveSubscription = mock(async (id) => ({
      id,
      status: 'canceled',
      customer: 'cus_1',
      items: [{ priceId: 'price_qualifying' }],
    }));
    await expect(
      reconcileUaExistingSubscriptions({
        input,
        config,
        dependencies: inactive,
      })
    ).rejects.toThrow('is not active or trialing');

    const wrongPrice = makeDependencies().dependencies;
    wrongPrice.retrieveSubscription = mock(async (id) => ({
      id,
      status: 'trialing',
      customer: 'cus_1',
      items: [{ priceId: 'price_other' }],
    }));
    await expect(
      reconcileUaExistingSubscriptions({
        input,
        config,
        dependencies: wrongPrice,
      })
    ).rejects.toThrow('has no qualifying price');

    const conflict = makeDependencies({
      existingLicense: {
        source: 'MANUAL',
        status: 'ACTIVE',
        stripeSubscriptionId: null,
      },
    }).dependencies;
    await expect(
      reconcileUaExistingSubscriptions({
        input,
        config,
        dependencies: conflict,
      })
    ).rejects.toThrow('requires manual review');
  });

  test('dry-run validates and emits audit without writing', async () => {
    const { dependencies } = makeDependencies();
    const audit = await reconcileUaExistingSubscriptions({
      input,
      config,
      dependencies,
      now: new Date('2026-08-30T12:00:00.000Z'),
    });

    expect(audit).toEqual([
      {
        result: 'VALIDATED',
        email: 'student@example.edu',
        subscriptionId: 'sub_123',
        subscriptionStatus: 'active',
        membershipId: 'membership-1',
        qualifyingPriceIds: ['price_qualifying'],
        existingLicense: 'NONE',
        validUntil: '2027-01-01T06:00:00.000Z',
      },
    ]);
    expect(
      dependencies.applyExistingSubscriptionLicenses
    ).not.toHaveBeenCalled();
  });

  test('apply uses an idempotent cohort plan and can be rerun safely', async () => {
    const fixture = makeDependencies();
    const options = {
      input,
      config,
      dependencies: fixture.dependencies,
      apply: true,
      now: new Date('2026-08-30T12:00:00.000Z'),
    } as const;

    const first = await reconcileUaExistingSubscriptions(options);
    const second = await reconcileUaExistingSubscriptions(options);

    expect(first[0]?.result).toBe('APPLIED');
    expect(second[0]).toMatchObject({
      result: 'APPLIED',
      existingLicense: 'EXISTING_SUBSCRIPTION',
    });
    expect(fixture.applied).toHaveLength(2);
    expect(fixture.applied[0]).toEqual(fixture.applied[1]);
    expect(fixture.applied[0]?.[0]).toMatchObject({
      membershipId: 'membership-1',
      cohort: 'ua-2026',
      stripePriceId: 'price_qualifying',
      stripeCustomerId: 'cus_existing',
      currency: 'usd',
    });
  });

  test('rejects cross-run subscription reuse while allowing the original rerun', async () => {
    const fixture = makeDependencies();
    const firstRun = {
      input,
      config,
      dependencies: fixture.dependencies,
      apply: true,
      now: new Date('2026-08-30T12:00:00.000Z'),
    } as const;

    await reconcileUaExistingSubscriptions(firstRun);
    await expect(reconcileUaExistingSubscriptions(firstRun)).resolves.toHaveLength(
      1
    );

    fixture.dependencies.findActiveStudentMemberships = mock(async () => [
      { id: 'membership-2', organizationId: 'org-ua' },
    ]);
    fixture.dependencies.findLicense = mock(async () => null);

    await expect(
      reconcileUaExistingSubscriptions({
        ...firstRun,
        input: [
          { email: 'other-student@example.edu', subscriptionId: 'sub_123' },
        ],
      })
    ).rejects.toThrow('is already attached to another student license');
    expect(fixture.applied).toHaveLength(2);
  });
});
