import { describe, expect, test } from 'bun:test';
import { FREE_TIER_STATE_GROUPS } from './free-tier-states.catalog';

describe('free-tier states catalog', () => {
  test('Lifecycle group jumps rejected and expired applications to status', () => {
    const lifecycle = FREE_TIER_STATE_GROUPS.find((g) => g.id === 'lifecycle');
    expect(lifecycle?.states.map((s) => s.id)).toEqual([
      'lifecycle.rejected',
      'lifecycle.expired',
    ]);
    expect(lifecycle?.states.map((s) => s.label)).toEqual([
      'Not approved',
      'Invite expired',
    ]);
  });

  test('catalog size matches the CI free-tier jump log gate', () => {
    const count = FREE_TIER_STATE_GROUPS.reduce(
      (total, group) => total + group.states.length,
      0
    );
    expect(count).toBe(18);
  });

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
