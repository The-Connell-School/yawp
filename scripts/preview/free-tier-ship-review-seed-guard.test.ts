import { describe, expect, test } from 'bun:test';
import { shouldRunFreeTierShipReviewSeed } from './free-tier-ship-review-seed-guard.mjs';

describe('free-tier ship-review seed guard', () => {
  test('allows PR preview databases only', () => {
    expect(shouldRunFreeTierShipReviewSeed('yawp_pr_416')).toBe(true);
    expect(shouldRunFreeTierShipReviewSeed('yawp_pr_1')).toBe(true);
  });

  test('blocks demo and malformed names', () => {
    expect(shouldRunFreeTierShipReviewSeed('yawp_demo')).toBe(false);
    expect(shouldRunFreeTierShipReviewSeed('yawp_pr_')).toBe(false);
    expect(shouldRunFreeTierShipReviewSeed('yawp_pr_abc')).toBe(false);
    expect(shouldRunFreeTierShipReviewSeed('')).toBe(false);
  });
});
