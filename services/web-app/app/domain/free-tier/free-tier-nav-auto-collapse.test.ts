import { describe, expect, test } from 'bun:test';
import {
  FREE_TIER_NAV_AUTO_COLLAPSE_BELOW_PX,
  shouldAutoCollapseFreeTierNavOnResize,
} from './free-tier-nav-auto-collapse';

describe('shouldAutoCollapseFreeTierNavOnResize', () => {
  test('collapses on first paint in the narrow band when nav is expanded', () => {
    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 1100,
        wasInNarrowBand: null,
        navExpanded: true,
      })
    ).toEqual({ collapse: true, inNarrowBand: true });
  });

  test('does not collapse while staying in the narrow band after manual re-expand', () => {
    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 1100,
        wasInNarrowBand: true,
        navExpanded: true,
      })
    ).toEqual({ collapse: false, inNarrowBand: true });
  });

  test('collapses again after leaving wide layout and re-entering narrow', () => {
    const wide = shouldAutoCollapseFreeTierNavOnResize({
      viewportWidth: FREE_TIER_NAV_AUTO_COLLAPSE_BELOW_PX,
      wasInNarrowBand: true,
      navExpanded: true,
    });
    expect(wide.inNarrowBand).toBe(false);

    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 1180,
        wasInNarrowBand: wide.inNarrowBand,
        navExpanded: true,
      })
    ).toEqual({ collapse: true, inNarrowBand: true });
  });

  test('ignores mobile overlay widths', () => {
    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 390,
        wasInNarrowBand: null,
        navExpanded: true,
      })
    ).toEqual({ collapse: false, inNarrowBand: false });
  });
});
