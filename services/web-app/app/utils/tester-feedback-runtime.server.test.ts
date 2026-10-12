import { describe, expect, mock, test } from 'bun:test';
import {
  saveTesterFeedback,
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
