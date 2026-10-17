import { describe, expect, mock, test } from 'bun:test';
import {
  saveTesterFeedback,
  listTesterFeedback,
  type FeedbackWriteTransaction,
} from './tester-feedback-runtime.server';
import type { FeedbackInput } from './tester-feedback.server';

const input: FeedbackInput = {
  userId: 'tester-1',
  url: '/app',
  userAgent: 'test',
  whatIDid: 'Opened',
  whatHappened: 'Froze',
  whatIWish: 'Save',
  severity: null,
  environment: 'demo',
};

describe('feedback database rate limit', () => {
  test('locks before counting and inserts below five in the last ten minutes', async () => {
    const order: string[] = [];
    const count = mock(async () => {
      order.push('count');
      return 4;
    });
    const create = mock(async () => {
      order.push('create');
      return {};
    });
    const lock = mock(async () => {
      order.push('lock');
      return 1;
    });
    const tx = {
      $executeRaw: lock,
      testerFeedback: { count, create },
    } as unknown as FeedbackWriteTransaction;
    expect(
      await saveTesterFeedback(input, async (operation) => operation(tx))
    ).toBe(true);
    expect(order).toEqual(['lock', 'count', 'create']);
    expect(create).toHaveBeenCalledWith({ data: input });
    expect(count).toHaveBeenCalledWith({
      where: { userId: 'tester-1', createdAt: { gte: expect.any(Date) } },
    });
  });
  test('does not insert at five submissions', async () => {
    const create = mock(async () => ({}));
    const tx = {
      $executeRaw: mock(async () => 1),
      testerFeedback: { count: mock(async () => 5), create },
    } as unknown as FeedbackWriteTransaction;
    expect(
      await saveTesterFeedback(input, async (operation) => operation(tx))
    ).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});


test('list joins only server User email/name, keeps filters and pagination, normalizes historical actions', async () => {
  const findMany = mock(async () => [
    { id: 'new', actions: [{ type: 'route', path: '/app' }], user: { email: 'server@example.test', name: 'Server User' } },
    { id: 'legacy', actions: null, user: null },
    { id: 'invalid-json', actions: { unexpected: true }, user: { email: null, name: null } },
  ]);
  const query = { environment: 'demo', userId: 'tester-1', severity: 'high', since: '2026-10-01T00:00:00Z', until: '2026-10-31T00:00:00Z', cursor: 'cursor', limit: 51, format: 'json' } as const;
  const rows = await listTesterFeedback(query, { findMany } as any);
  expect(findMany).toHaveBeenCalledWith({
    where: { environment: 'demo', userId: 'tester-1', severity: 'high', createdAt: { gte: new Date(query.since), lte: new Date(query.until) } },
    include: { user: { select: { email: true, name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], cursor: { id: 'cursor' }, skip: 1, take: 51,
  });
  expect(rows).toEqual([
    { id: 'new', actions: [{ type: 'route', path: '/app' }], userEmail: 'server@example.test', userName: 'Server User' },
    { id: 'legacy', actions: null, userEmail: null, userName: null },
    { id: 'invalid-json', actions: null, userEmail: null, userName: null },
  ]);
});
test('writes exact validated structured actions through the existing transaction', async () => {
  const create = mock(async () => ({}));
  const tx = { $executeRaw: mock(async () => 1), testerFeedback: { count: mock(async () => 0), create } } as unknown as FeedbackWriteTransaction;
  const withActions = { ...input, actions: [{ type: 'route' as const, path: '/app' }] };
  expect(await saveTesterFeedback(withActions, async operation => operation(tx))).toBe(true);
  expect(create).toHaveBeenCalledWith({ data: withActions });
});
