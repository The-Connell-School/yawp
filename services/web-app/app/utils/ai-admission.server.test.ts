import { beforeEach, describe, expect, mock, test } from 'bun:test';

const transaction = {
  $queryRaw: mock(),
  aiRequestReservation: {
    count: mock(),
    createMany: mock(),
    deleteMany: mock(),
  },
};
const prisma = {
  $transaction: mock(),
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { AiRateLimitError, reserveAiRequest } =
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
  prisma.$transaction
    .mockReset()
    .mockImplementation(
      async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction)
    );
});

describe('reserveAiRequest', () => {
  test('locks both budgets, counts inside the transaction, and reserves units', async () => {
    transaction.aiRequestReservation.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4);

    await reserveAiRequest({
      membershipId: 'member-1',
      organizationId: 'org-1',
      feature: 'writing-fundamentals-generation',
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
      feature: 'writing-fundamentals-generation',
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
});
