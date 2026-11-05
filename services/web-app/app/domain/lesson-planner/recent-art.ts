/**
 * The paintings on a teacher's recent decks (Kevin, Oct 22), so the planner
 * does not hang the same one on every lesson: Brian's Turner was an example
 * in the kit, not a house painting.
 */
import { resolveDeckArt } from './deck-art';
import { readSlideDeck } from './slide-deck';

/** A painting a teacher used on a recent deck. */
export type RecentArt = { art: string; lesson: string; unit: string | null };

/** From replies newest first: each painting once, with the lesson it was on. */
export function recentArtFrom(replies: string[]): RecentArt[] {
  const seen = new Map<string, RecentArt>();
  for (const reply of replies) {
    const outcome = readSlideDeck(reply);
    if (outcome.kind !== 'deck') continue;
    const { art, title, unit } = outcome.deck;
    if (!art || seen.has(art) || !resolveDeckArt(art)) continue;
    seen.set(art, { art, lesson: title, unit: unit ?? null });
  }
  return [...seen.values()];
}
