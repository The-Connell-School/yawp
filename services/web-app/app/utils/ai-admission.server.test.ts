import { beforeEach, describe, expect, mock, test } from 'bun:test';

const transaction = {
  $queryRaw: mock(),
  aiRequestReservation: {
    count: mock(),
    createMany: mock(),
    deleteMany: mock(),
    findFirst: mock(),
  },
};
const prisma = {
  $transaction: mock(),
  organization: { findUnique: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));
const isFreeTierEnabled = mock(async () => false);
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));
const isAiUnlocked = mock(async () => true);
mock.module('~/domain/free-tier/is-ai-unlocked.server', () => ({
  isAiUnlocked,
}));
const assertFreeTierSpendAllowed = mock(async () => ({}));
class FreeTierSpendGuardDeniedError extends Error {}
mock.module('~/domain/free-tier/usage-budget.server', () => ({
  assertFreeTierSpendAllowed,
  FreeTierSpendGuardDeniedError,
}));

const { AiFreeTierBudgetExceededError, AiRateLimitError, reserveAiRequest } =
  await import('./ai-admission.server');

const policy = {
  membershipLimit: 3,
  membershipWindowMs: 60_000,
  organizationLimit: 10,
  organizationWindowMs: 3_600_000,
};

beforeEach(() => {
  transaction.$queryRaw.mockReset().mockResolvedValue([]);
  transaction.aiRequestReservation.count.mockReset();
  transaction.aiRequestReservation.createMany
    .mockReset()
    .mockResolvedValue({ count: 1 });
  transaction.aiRequestReservation.deleteMany
    .mockReset()
    .mockResolvedValue({ count: 0 });
  transaction.aiRequestReservation.findFirst
    .mockReset()
    .mockResolvedValue(null);
  prisma.$transaction
    .mockReset()
    .mockImplementation(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction)
    );
  prisma.organization.findUnique.mockReset().mockResolvedValue(null);
  isFreeTierEnabled.mockReset().mockResolvedValue(false);
  isAiUnlocked.mockReset().mockResolvedValue(true);
  assertFreeTierSpendAllowed.mockReset().mockResolvedValue({});
});

describe('reserveAiRequest', () => {
  test('locks both budgets, counts inside the transaction, and reserves units', async () => {
    transaction.aiRequestReservation.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4);

    await reserveAiRequest({
      membershipId: 'member-1',
      organizationId: 'org-1',
      feature: 'class-insights',
      policy,
      units: 2,
      now: new Date('2026-07-20T12:00:00.000Z'),
    });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.aiRequestReservation.deleteMany).toHaveBeenCalledTimes(
      1
    );
    expect(transaction.aiRequestReservation.count).toHaveBeenCalledTimes(2);
    const create = transaction.aiRequestReservation.createMany.mock.calls[0][0];
    expect(create.data).toHaveLength(2);
    expect(create.data[0]).toMatchObject({
      membershipId: 'member-1',
      organizationId: 'org-1',
      feature: 'class-insights',
    });
  });

  test('fails closed before inserting when requested units exceed membership capacity', async () => {
    transaction.aiRequestReservation.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);

    await expect(
      reserveAiRequest({
        membershipId: 'member-1',
        organizationId: 'org-1',
        feature: 'reporter',
        policy,
        units: 2,
      })
    ).rejects.toBeInstanceOf(AiRateLimitError);
    expect(transaction.aiRequestReservation.createMany).not.toHaveBeenCalled();
  });

  test('rejects invalid reservation units before opening a transaction', async () => {
    await expect(
      reserveAiRequest({
        membershipId: 'member-1',
        organizationId: 'org-1',
        feature: 'reporter',
        policy,
        units: 0,
      })
    ).rejects.toThrow('positive integer');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('free classroom AI fails closed before reserving when free-tier budget is exhausted', async () => {
    isFreeTierEnabled.mockResolvedValue(true);
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-free',
      plan: 'FREE_CLASSROOM',
    });
    assertFreeTierSpendAllowed.mockRejectedValue(new FreeTierSpendGuardDeniedError());

    await expect(
      reserveAiRequest({
        membershipId: 'member-1',
        organizationId: 'org-free',
        feature: 'lesson-planner',
        policy,
      })
    ).rejects.toBeInstanceOf(AiFreeTierBudgetExceededError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.aiRequestReservation.createMany).not.toHaveBeenCalled();
  });
  for (const plan of ['SCHOOL', 'FREE_CLASSROOM']) {
    test(`${plan} preserves AI admission when spend is allowed`, async () => {
      isFreeTierEnabled.mockResolvedValue(true);
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan });
      transaction.aiRequestReservation.count.mockResolvedValue(0);
      await reserveAiRequest({ membershipId: 'member-1', organizationId: 'org-1', feature: 'reporter', policy });
      expect(transaction.aiRequestReservation.createMany).toHaveBeenCalledTimes(1);
      expect(assertFreeTierSpendAllowed.mock.calls.length).toBe(plan === 'FREE_CLASSROOM' ? 1 : 0);
    });
  }

});
