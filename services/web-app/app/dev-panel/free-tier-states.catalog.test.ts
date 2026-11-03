import { describe, expect, test } from 'bun:test';
import { FREE_TIER_STATE_GROUPS } from './free-tier-states.catalog';

describe('free-tier states catalog', () => {
  test('Approved group lists seven designed jumper states', () => {
    const approved = FREE_TIER_STATE_GROUPS.find((g) => g.id === 'approved');
    expect(approved?.states.map((s) => s.id)).toEqual([
      'approved.first-time-toast',
      'approved.usage-plenty-left',
      'approved.usage-about-half-left',
      'approved.usage-a-few-left',
      'approved.usage-all-used',
      'approved.lesson-planner-limit',
      'approved.reporter-limit',
    ]);
  });
});
