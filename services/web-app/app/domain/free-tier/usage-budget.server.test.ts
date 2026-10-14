import { describe, expect, test } from 'bun:test';
import {
  assertFreeTierBudgetHeadroomForTransition,
  assertFreeTierBudgetHeadroom,
  calculateFreeTierUsage,
  FreeTierBudgetExceededError,
  freeTierBudgetRemainingActivations,
  resolveFreeTierBudgetBasis,
} from './usage-budget.server';

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
});
