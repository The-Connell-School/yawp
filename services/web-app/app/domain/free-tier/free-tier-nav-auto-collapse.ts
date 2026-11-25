/** Viewport widths at/above this use expanded sidebar when the user prefers it. */
export const FREE_TIER_NAV_AUTO_COLLAPSE_BELOW_PX = 1280;

/** Tailwind `sm` — mobile overlay nav; auto-collapse applies on desktop/tablet only. */
export const FREE_TIER_NAV_AUTO_COLLAPSE_MIN_PX = 640;

export function isFreeTierNavAutoCollapseViewport(width: number): boolean {
  return (
    width >= FREE_TIER_NAV_AUTO_COLLAPSE_MIN_PX &&
    width < FREE_TIER_NAV_AUTO_COLLAPSE_BELOW_PX
  );
}

/** True when the nav cookie already stores expanded or collapsed. */
export function hasExplicitNavPreference(state: unknown): boolean {
  return state === 'expanded' || state === 'collapsed';
}

/**
 * Collapse when the viewport enters the narrow band, and on the first paint
 * in that band when the teacher has not saved a preference.
 *
 * `wasInNarrowBand === null` is the first observation of this page load, not
 * proof the viewport just entered the band. A saved expand or collapse choice
 * therefore survives reload. Crossing into the band from outside still
 * collapses, including after an explicit expand, until the teacher expands
 * again inside the band.
 */
export function shouldAutoCollapseFreeTierNavOnResize(args: {
  viewportWidth: number;
  wasInNarrowBand: boolean | null;
  navExpanded: boolean;
  navPreferenceExplicit?: boolean;
}): { collapse: boolean; inNarrowBand: boolean } {
  const inNarrowBand = isFreeTierNavAutoCollapseViewport(args.viewportWidth);
  const enteredFromOutside = inNarrowBand && args.wasInNarrowBand === false;
  const firstPaintWithoutPreference =
    inNarrowBand &&
    args.wasInNarrowBand === null &&
    args.navPreferenceExplicit !== true;
  const collapse =
    args.navExpanded && (enteredFromOutside || firstPaintWithoutPreference);
  return { collapse, inNarrowBand };
}
