/**
 * A deck's map slides, with their places found (Nov 19), wherever a deck is
 * about to be stored or handed back: the planner's reply, the editor's
 * save, the studio chat's answer. The planner names a place; the position is
 * always Yawp!'s own (resolveDeckPlaces), so nothing a model or a page wrote
 * as a position is ever kept.
 */
import { resolveDeckPlaces } from '~/domain/geo/places.server';
import { fenceSlideDeck, readSlideDeck } from './slide-deck';

export { resolveDeckPlaces };

/** The reply with its deck's places found. A reply with no deck, or a deck with no map, comes back as it was. */
export function withResolvedPlaces(reply: string): string {
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck' || !outcome.deck.slides.some((slide) => slide.layout === 'map')) return reply;
  try {
    return `${outcome.body.trim()}\n\n${fenceSlideDeck(resolveDeckPlaces(outcome.deck))}`;
  } catch {
    // Map data that cannot be read: the deck is kept as written, and its places are simply not on a map.
    return reply;
  }
}
