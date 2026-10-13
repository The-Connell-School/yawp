import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireSuperAdmin = mock(async () => ({ id: 'operator' }));
const userFindUnique = mock(async () => ({ email: 'operator@yawp.local' }));
const freeTierFindMany = mock(async () => []);
const transaction = mock(async () => {
  throw new Error('admin route must use shared decision service');
});
const releaseBatch = mock(async () => ({
  released: 1,
  refused: 0,
  skipped: 0,
  cappedAt: 100,
}));
const createAcquisitionTokens = mock(async () => []);
const sendReleaseEmailsForApplicationIds = mock(async () => []);
const decideApplication = mock(async (): Promise<any> => ({
  status: 200,
  payload: { ok: true, status: 'APPROVED' },
}));
const reopenApplication = mock(async () => ({
  status: 200,
  payload: { ok: true },
}));

mock.module('~/utils/auth.server', () => ({ requireSuperAdmin }));
mock.module('~/utils/db.server', () => ({
  prisma: {
    $transaction: transaction,
    user: { findUnique: userFindUnique },
    freeTierApplication: { findMany: freeTierFindMany },
  },
}));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/domain/free-tier/service.server', () => ({
  createAcquisitionTokens,
  getFreeTierReleaseCap: () => 100,
  releaseBatch,
}));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  sendReleaseEmailsForApplicationIds,
}));
mock.module('~/utils/internal-free-tier-http.server', () => ({
  decideApplication,
  reopenApplication,
}));

const route = await import('./route');

function actionArgs(intent: string) {
  const form = new FormData();
  form.set('intent', intent);
  form.set('applicationId', 'application');
  form.set('reason', 'No longer eligible');
  return {
    request: new Request('https://yawp.test/app/admin/free-tier', {
      method: 'POST',
      body: form,
    }),
    params: {},
    context: {},
  } as never;
}

beforeEach(() => {
  requireSuperAdmin.mockClear();
  userFindUnique.mockClear();
  freeTierFindMany.mockClear();
  transaction.mockClear();
  releaseBatch.mockClear();
  releaseBatch.mockImplementation(async () => ({
    released: 1,
    refused: 0,
    skipped: 0,
    cappedAt: 100,
  }));
  sendReleaseEmailsForApplicationIds.mockClear();
  decideApplication.mockClear();
  decideApplication.mockImplementation(async () => ({
    status: 200,
    payload: { ok: true, status: 'APPROVED' },
  }));
  reopenApplication.mockClear();
});

describe('admin free-tier route', () => {
  test('approve uses shared budget-checked decision service', async () => {
    const response = (await route.action(actionArgs('approve'))) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'APPROVED' });
    expect(decideApplication).toHaveBeenCalledWith({
      id: 'application',
      decision: 'APPROVED',
      decidedByEmail: 'operator@yawp.local',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  test('approve preserves shared over-budget denial status and payload', async () => {
    decideApplication.mockImplementation(async () => ({
      status: 402,
      payload: {
        ok: false,
        error: 'Free-tier budget reached',
        operatorMessage: 'Free-tier production budget reached.',
      },
    }));

    const response = (await route.action(actionArgs('approve'))) as Response;

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'Free-tier budget reached',
      operatorMessage: 'Free-tier production budget reached.',
    });
  });

  test('release returns clear budget feedback when budget is exhausted', async () => {
    const { FreeTierBudgetExceededError } = await import(
      '~/domain/free-tier/usage-budget.server'
    );
    releaseBatch.mockImplementation(async () => {
      throw new FreeTierBudgetExceededError({
        environment: 'preview',
        budgetUsd: 10,
        unitCostUsd: 5,
        activeApplications: 3,
        spendUsd: 15,
        remainingUsd: 0,
        percentUsed: 100,
        overBudget: true,
      });
    });

    const response = (await route.action(actionArgs('release'))) as Response;

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'Free-tier budget reached',
      operatorMessage: 'Free-tier preview budget reached: $15.00 of $10.00 used.',
    });
    expect(sendReleaseEmailsForApplicationIds).not.toHaveBeenCalled();
  });
});
