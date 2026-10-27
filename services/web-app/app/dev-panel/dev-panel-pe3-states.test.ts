import { describe, expect, test } from 'bun:test';
import { PE3_FREE_TIER_STATES, pe3FreeTierRowValue } from './dev-panel-pe3-states';

describe('PE3 free-tier states', () => {
  test('lists eight flat states with codes', () => {
    expect(PE3_FREE_TIER_STATES).toHaveLength(8);
    expect(PE3_FREE_TIER_STATES.map((s) => s.code)).toEqual([
      'LEAD',
      'INVITED',
      'ACCOUNT_CREATED',
      'SENT',
      'MANUAL_REVIEW',
      'APPROVED',
      'REJECTED',
      'EXPIRED',
    ]);
  });

  test('row value for pending maps to Pending', () => {
    expect(pe3FreeTierRowValue('pending.waiting-on-admin')).toBe('Pending');
  });
});
