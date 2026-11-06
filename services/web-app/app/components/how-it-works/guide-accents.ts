/**
 * One accent color per "See how it works" page (Brian, Nov 5). Terracotta is
 * retiring as the accent; each guide picks one of these six and uses it
 * everywhere on that page: the buttons, the numbered step circles, and the
 * big feature panels. Pages differ on purpose, so neighbours don't all match.
 */
import type { LandingPageKey } from '~/routes/app.assignment-types.$id/landing-copy/content';

export const GUIDE_ACCENTS = {
  forest: '#1F4D3A',
  navy: '#1E3A5F',
  charcoal: '#2B2B2B',
  maroon: '#6E1A26',
  petrol: '#1F4E5F',
  ink: '#14213D',
} as const;

export type GuideAccentName = keyof typeof GUIDE_ACCENTS;

/**
 * Which color each assignment type's guide gets, by its landing page key.
 * Only The Thesis-Driven Essay has a guide today; Class Starter's color is
 * reserved for when it gets one. Add the next page here with the next color.
 */
export const GUIDE_PAGE_ACCENTS: Partial<Record<LandingPageKey, GuideAccentName>> = {
  'thesis-driven-essay': 'forest',
  'class-starter': 'maroon',
};

export function guideAccentFor(key: LandingPageKey | null | undefined): string | null {
  const name = key ? GUIDE_PAGE_ACCENTS[key] : undefined;
  return name ? GUIDE_ACCENTS[name] : null;
}
