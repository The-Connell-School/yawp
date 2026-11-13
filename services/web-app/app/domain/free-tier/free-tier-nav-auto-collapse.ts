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

/**
 * Collapse when entering the narrow band (not on every resize tick while staying narrow),
 * so a teacher can re-expand until they leave wide layout and re-enter narrow.
 */
export function shouldAutoCollapseFreeTierNavOnResize(args: {
  viewportWidth: number;
  wasInNarrowBand: boolean | null;
  navExpanded: boolean;
}): { collapse: boolean; inNarrowBand: boolean } {
  const inNarrowBand = isFreeTierNavAutoCollapseViewport(args.viewportWidth);
  const enteredNarrowBand =
    inNarrowBand && args.wasInNarrowBand !== true;
  const collapse =
    enteredNarrowBand && args.navExpanded && inNarrowBand;
  return { collapse, inNarrowBand };
}
