import { describe, expect, test } from 'bun:test';
import { FREE_TIER_STATE_GROUPS } from './free-tier-states.catalog';
import { listCatalogFreeTierJumpExpectations } from './free-tier-jump-expectations';

describe('free-tier jump expectations', () => {
  test('covers every catalog state', () => {
    const catalogIds = FREE_TIER_STATE_GROUPS.flatMap((group) =>
      group.states.map((state) => state.id)
    );
    const expectationIds = listCatalogFreeTierJumpExpectations().map(
      (entry) => entry.stateId
    );
    expect(expectationIds.sort()).toEqual([...catalogIds].sort());
  });
});
