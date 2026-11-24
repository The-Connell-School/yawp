import { describe, expect, test } from 'bun:test';
import {
  FREE_TIER_NAV_AUTO_COLLAPSE_BELOW_PX,
  hasExplicitNavPreference,
  shouldAutoCollapseFreeTierNavOnResize,
} from './free-tier-nav-auto-collapse';

describe('shouldAutoCollapseFreeTierNavOnResize', () => {
  test('collapses on first paint in the narrow band when no preference is saved', () => {
    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 1100,
        wasInNarrowBand: null,
        navExpanded: true,
        navPreferenceExplicit: false,
      })
    ).toEqual({ collapse: true, inNarrowBand: true });
  });

  test('keeps an explicit expanded preference on reload in the narrow band', () => {
    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 1100,
        wasInNarrowBand: null,
        navExpanded: true,
        navPreferenceExplicit: true,
      })
    ).toEqual({ collapse: false, inNarrowBand: true });
  });

  test('does not expand a sidebar the teacher explicitly collapsed', () => {
    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 1100,
        wasInNarrowBand: null,
        navExpanded: false,
        navPreferenceExplicit: true,
      })
    ).toEqual({ collapse: false, inNarrowBand: true });
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
      navPreferenceExplicit: true,
    });
    expect(wide.inNarrowBand).toBe(false);

    expect(
      shouldAutoCollapseFreeTierNavOnResize({
        viewportWidth: 1180,
        wasInNarrowBand: wide.inNarrowBand,
        navExpanded: true,
        navPreferenceExplicit: true,
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

describe('hasExplicitNavPreference', () => {
  test('is true only for a saved expanded or collapsed cookie', () => {
    expect(hasExplicitNavPreference('expanded')).toBe(true);
    expect(hasExplicitNavPreference('collapsed')).toBe(true);
    expect(hasExplicitNavPreference(undefined)).toBe(false);
    expect(hasExplicitNavPreference(null)).toBe(false);
    expect(hasExplicitNavPreference('wide')).toBe(false);
  });
});
