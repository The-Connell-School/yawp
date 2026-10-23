import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanMessage: { findMany: mock(), update: mock() },
  lessonPlanMaterial: { findMany: mock(), update: mock() },
  $transaction: mock(),
};
mock.module('~/utils/db.server', () => ({ prisma }));

const { loadStackOrder, moveStackEntry, nextPositionFor, writeStackOrder } =
  await import('./stack-order.server');

afterAll(() => mock.restore());

const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 10, minute));

beforeEach(() => {
  prisma.lessonPlanMessage.findMany.mockReset().mockResolvedValue([
    { id: 'r1', createdAt: at(1), position: null },
  ]);
  prisma.lessonPlanMaterial.findMany.mockReset().mockResolvedValue([
    { id: 'm2', sourceCreatedAt: at(2), position: null },
    { id: 'm1', sourceCreatedAt: at(1), position: null },
  ]);
  prisma.lessonPlanMessage.update.mockReset().mockImplementation((args) => args);
  prisma.lessonPlanMaterial.update.mockReset().mockImplementation((args) => args);
  prisma.$transaction.mockReset().mockImplementation(async (ops) => ops);
});

describe('loadStackOrder', () => {
  test('reads kept replies and filed pieces in written order', async () => {
    expect(await loadStackOrder('plan-1')).toEqual(['r:r1', 'm:m1', 'm:m2']);
    expect(prisma.lessonPlanMessage.findMany.mock.calls[0][0].where).toMatchObject({
      conversationId: 'plan-1',
      role: 'assistant',
      keptAt: { not: null },
    });
  });
});

describe('writeStackOrder', () => {
  test('gives every piece its place, in one transaction', async () => {
    const result = await writeStackOrder('plan-1', ['m:m2', 'r:r1', 'm:m1']);
    expect(result).toEqual({ ok: true, order: ['m:m2', 'r:r1', 'm:m1'] });
    const ops = prisma.$transaction.mock.calls[0][0];
    expect(ops).toHaveLength(3);
    expect(prisma.lessonPlanMaterial.update.mock.calls[0][0]).toEqual({
      where: { id: 'm2', conversationId: 'plan-1' },
      data: { position: 0 },
    });
    expect(prisma.lessonPlanMessage.update.mock.calls[0][0]).toEqual({
      where: { id: 'r1', conversationId: 'plan-1' },
      data: { position: 1 },
    });
  });

  test('refuses a piece that is not in this lesson', async () => {
    const result = await writeStackOrder('plan-1', ['m:m2', 'm:elsewhere']);
    expect(result).toEqual({ ok: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('a piece the order leaves out (mid-removal) keeps its turn at the end', async () => {
    const result = await writeStackOrder('plan-1', ['m:m2', 'm:m1']);
    expect(result).toEqual({ ok: true, order: ['m:m2', 'm:m1', 'r:r1'] });
  });
});

describe('moveStackEntry', () => {
  test('swaps a piece with the one above it', async () => {
    const result = await moveStackEntry('plan-1', 'm:m2', 'up');
    expect(result).toEqual({ ok: true, order: ['r:r1', 'm:m2', 'm:m1'] });
  });

  test('the first piece cannot go further up; nothing is written', async () => {
    const result = await moveStackEntry('plan-1', 'r:r1', 'up');
    expect(result).toEqual({ ok: true, order: ['r:r1', 'm:m1', 'm:m2'] });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('refuses a piece that is not in this lesson', async () => {
    expect(await moveStackEntry('plan-1', 'm:nope', 'down')).toEqual({ ok: false });
  });
});

describe('nextPositionFor', () => {
  test('null for a stack nobody has reordered', async () => {
    expect(await nextPositionFor('plan-1')).toBeNull();
  });

  test('the end of a reordered stack', async () => {
    prisma.lessonPlanMaterial.findMany.mockResolvedValue([
      { id: 'm2', sourceCreatedAt: at(2), position: 0 },
      { id: 'm1', sourceCreatedAt: at(1), position: 2 },
    ]);
    prisma.lessonPlanMessage.findMany.mockResolvedValue([
      { id: 'r1', createdAt: at(1), position: 1 },
    ]);
    expect(await nextPositionFor('plan-1')).toBe(3);
  });
});
