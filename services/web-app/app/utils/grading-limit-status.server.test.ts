import { test, expect, mock } from 'bun:test';
const read = mock(
  async (..._args: unknown[]) =>
    [] as Array<{
      tokens: number;
      capacity: number;
      refillPerMs: number;
      lastMs: number;
    }>
);
mock.module('~/utils/db.server', () => ({ prisma: { $queryRawUnsafe: read } }));
const { readGradingLimitStatus } = await import('./rate-limit.server');
test('grading status is read-only, and absent buckets report no pause', async () => {
  expect(await readGradingLimitStatus('teacher', 1_000)).toBeNull();
  expect(read).toHaveBeenCalledTimes(4);
  expect(
    read.mock.calls.every((call) => String(call[0]).startsWith('SELECT'))
  ).toBe(true);
});
test('existing denied buckets report the actual refill time and configured window', async () => {
  read.mockImplementation(async (...args: unknown[]) => {
    if (args[1] !== 'user:grading:teacher:h') return [];
    return [
      { tokens: 0, capacity: 80, refillPerMs: 80 / 3_600_000, lastMs: 1_000 },
    ];
  });
  const status = await readGradingLimitStatus('teacher', 1_000);
  expect(status?.window).toBe('hourly');
  expect(status?.limit).toBe(80);
  expect(new Date(status!.retryAt).getTime()).toBeGreaterThan(1_000);
});
