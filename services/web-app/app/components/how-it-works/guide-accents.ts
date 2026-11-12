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

/** A guide page: an assignment type's, by its landing page key, or Reporter's. */
export type GuidePageKey = LandingPageKey | 'reporter';

/**
 * Which color each guide gets: The Thesis-Driven Essay, Class Starter, the two
 * writing-step guides (Prewriting, Thesis Statement), and Reporter. Add the
 * next page here with the next color. Ink is still free.
 */
export const GUIDE_PAGE_ACCENTS: Partial<Record<GuidePageKey, GuideAccentName>> = {
  'thesis-driven-essay': 'forest',
  'class-starter': 'maroon',
  prewriting: 'navy',
  'thesis-statement': 'petrol',
  reporter: 'charcoal',
  // The sixth color, unused until the Exit Ticket guide (Kevin, Nov 10).
  'exit-ticket': 'ink',
};

export function guideAccentFor(key: GuidePageKey | null | undefined): string | null {
  const name = key ? GUIDE_PAGE_ACCENTS[key] : undefined;
  return name ? GUIDE_ACCENTS[name] : null;
}
