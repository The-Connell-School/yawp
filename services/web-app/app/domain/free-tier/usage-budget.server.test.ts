import { describe, expect, test } from 'bun:test';
import {
  assertFreeTierBudgetHeadroomForTransition,
  assertFreeTierBudgetHeadroom,
  assertFreeTierSpendAllowed,
  calculateFreeTierUsage,
  FreeTierBudgetExceededError,
  FreeTierSpendGuardDeniedError,
  freeTierBudgetRemainingActivations,
  resolveFreeTierBudgetBasis,
  FREE_TIER_UNCAPPED,
} from './usage-budget.server';

for (const [label, count, budget, unitCost, denied] of [
  ['below', 99, 250, 2.5, false],
  ['at', 100, 250, 2.5, true],
  ['above', 101, 250, 2.5, true],
  ['less than one activation remaining', 99, 249, 2.5, true],
  ['zero budget', 0, 0, 2.5, true],
  ['zero cost and zero budget', 100, 0, 0, false],
] as const) test(`status source: existing spend guard at ${label} budget`, async () => {
  const client = { freeTierApplication: { count: async () => count } };
  const check = assertFreeTierSpendAllowed(client as any, {
    FREE_TIER_BUDGET_USD: String(budget),
    FREE_TIER_UNIT_COST_USD: String(unitCost),
  });
  if (denied) await expect(check).rejects.toBeInstanceOf(FreeTierSpendGuardDeniedError);
  else expect((await check).activeApplications).toBe(count);
});

describe('free-tier usage budget', () => {
  test('calculates spend percentage from a dollar budget', () => {
    const usage = calculateFreeTierUsage(
      { environment: 'demo', budgetUsd: 100, unitCostUsd: 2.5 },
      10
    );
    expect(usage.spendUsd).toBe(25);
    expect(usage.percentUsed).toBe(25);
    expect(usage.remainingUsd).toBe(75);
    expect(usage.overBudget).toBe(false);
    expect(freeTierBudgetRemainingActivations(usage)).toBe(30);
  });

  test('keeps demo, production, and preview budget bases separate', () => {
    const env = {
      FREE_TIER_BUDGET_ENVIRONMENT: 'demo',
      FREE_TIER_DEMO_BUDGET_USD: '50',
      FREE_TIER_PRODUCTION_BUDGET_USD: '500',
      FREE_TIER_PREVIEW_BUDGET_USD: '5',
      FREE_TIER_DEMO_UNIT_COST_USD: '1',
      FREE_TIER_PRODUCTION_UNIT_COST_USD: '10',
      FREE_TIER_PREVIEW_UNIT_COST_USD: '0.5',
    };
    expect(resolveFreeTierBudgetBasis(env)).toEqual({
      environment: 'demo',
      budgetUsd: 50,
      unitCostUsd: 1,
    });
    expect(resolveFreeTierBudgetBasis({ ...env, FREE_TIER_BUDGET_ENVIRONMENT: 'production' })).toEqual({
      environment: 'production',
      budgetUsd: 500,
      unitCostUsd: 10,
    });
    expect(resolveFreeTierBudgetBasis({ ...env, FREE_TIER_BUDGET_ENVIRONMENT: 'preview' })).toEqual({
      environment: 'preview',
      budgetUsd: 5,
      unitCostUsd: 0.5,
    });
  });

  test('resolves demo deploys separately from ordinary previews', () => {
    const env = {
      FREE_TIER_DEMO_BUDGET_USD: '50',
      FREE_TIER_PRODUCTION_BUDGET_USD: '500',
      FREE_TIER_PREVIEW_BUDGET_USD: '5',
      FREE_TIER_DEMO_UNIT_COST_USD: '1',
      FREE_TIER_PRODUCTION_UNIT_COST_USD: '10',
      FREE_TIER_PREVIEW_UNIT_COST_USD: '0.5',
      NODE_ENV: 'production',
    };

    expect(
      resolveFreeTierBudgetBasis({
        ...env,
        PREVIEW_SLUG: 'demo',
        YAWP_ENVIRONMENT: 'preview',
      })
    ).toEqual({
      environment: 'demo',
      budgetUsd: 50,
      unitCostUsd: 1,
    });
    expect(
      resolveFreeTierBudgetBasis({
        ...env,
        PREVIEW_SLUG: 'pr-526',
        YAWP_ENVIRONMENT: 'preview',
      })
    ).toEqual({
      environment: 'preview',
      budgetUsd: 5,
      unitCostUsd: 0.5,
    });
    expect(resolveFreeTierBudgetBasis({ ...env, YAWP_ENVIRONMENT: 'production' })).toEqual({
      environment: 'production',
      budgetUsd: 500,
      unitCostUsd: 10,
    });
  });

  test('hard-denies the next activation when it would exceed budget', async () => {
    const client = {
      freeTierApplication: {
        count: async () => 2,
      },
    };
    await expect(
      assertFreeTierBudgetHeadroom(client as any, {
        FREE_TIER_BUDGET_ENVIRONMENT: 'preview',
        FREE_TIER_PREVIEW_BUDGET_USD: '2',
        FREE_TIER_PREVIEW_UNIT_COST_USD: '1',
      })
    ).rejects.toBeInstanceOf(FreeTierBudgetExceededError);
  });

  test('does not charge transitions that are already counted as active usage', async () => {
    const client = {
      freeTierApplication: {
        count: async () => 1,
      },
    };
    const summary = await assertFreeTierBudgetHeadroomForTransition(
      client as any,
      {
        from: { status: 'SENT' },
        to: { status: 'APPROVED' },
      },
      {
        FREE_TIER_BUDGET_ENVIRONMENT: 'preview',
        FREE_TIER_PREVIEW_BUDGET_USD: '0',
        FREE_TIER_PREVIEW_UNIT_COST_USD: '1',
      }
    );
    expect(summary.activeApplications).toBe(1);
    expect(summary.overBudget).toBe(true);
  });

  test('denies spend-producing actions when no budget headroom remains', async () => {
    const client = {
      freeTierApplication: {
        count: async () => 2,
      },
    };
    await expect(
      assertFreeTierSpendAllowed(client as any, {
        FREE_TIER_BUDGET_ENVIRONMENT: 'preview',
        FREE_TIER_PREVIEW_BUDGET_USD: '2',
        FREE_TIER_PREVIEW_UNIT_COST_USD: '1',
      })
    ).rejects.toBeInstanceOf(FreeTierSpendGuardDeniedError);
  });
});

describe('production has no hidden activation cap', () => {
  test('production defaults to an uncapped budget; demo and preview keep $250', () => {
    expect(resolveFreeTierBudgetBasis({ FREE_TIER_BUDGET_ENVIRONMENT: 'production' }).budgetUsd).toBe(FREE_TIER_UNCAPPED);
    expect(resolveFreeTierBudgetBasis({ FREE_TIER_BUDGET_ENVIRONMENT: 'demo' }).budgetUsd).toBe(250);
    expect(resolveFreeTierBudgetBasis({ FREE_TIER_BUDGET_ENVIRONMENT: 'preview' }).budgetUsd).toBe(250);
    expect(resolveFreeTierBudgetBasis({ NODE_ENV: 'production' }).budgetUsd).toBe(FREE_TIER_UNCAPPED);
  });

  test('an explicit production budget still applies', () => {
    expect(resolveFreeTierBudgetBasis({ FREE_TIER_BUDGET_ENVIRONMENT: 'production', FREE_TIER_PRODUCTION_BUDGET_USD: '500' }).budgetUsd).toBe(500);
  });

  test('a thousand active teachers do not trip the production spend guard by default', async () => {
    const client = { freeTierApplication: { count: async () => 1000 } };
    expect((await assertFreeTierSpendAllowed(client as any, { NODE_ENV: 'production' })).overBudget).toBe(false);
    expect((await assertFreeTierBudgetHeadroom(client as any, { NODE_ENV: 'production' })).overBudget).toBe(false);
  });
});
