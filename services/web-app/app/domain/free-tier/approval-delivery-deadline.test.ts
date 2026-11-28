import { expect, test } from 'bun:test';
import { settleWithin } from './approval-delivery-deadline';

test('a slow drain does not hold the caller for the whole job', async () => {
  const started = Date.now();
  await settleWithin(new Promise((resolve) => setTimeout(resolve, 5000)), 200);
  expect(Date.now() - started).toBeLessThan(1000);
});
