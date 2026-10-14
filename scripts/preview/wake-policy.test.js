import { expect, test } from 'bun:test';
import { createWakeLimiter } from './wake-policy.mjs';
test('global anonymous wake budget and PR cooldown bound churn across different IPs', () => {
  let now = 1000;
  const limiter = createWakeLimiter({ now: () => now, globalHour: 2 });
  expect(limiter.take(1, 'ip1')).toBe(0);
  expect(limiter.take(1, 'ip2')).toBe(60);
  expect(limiter.take(2, 'ip2')).toBe(0);
  expect(limiter.take(3, 'ip3')).toBe(3600);
  now += 3600;
  expect(limiter.take(3, 'ip3')).toBe(0);
});
