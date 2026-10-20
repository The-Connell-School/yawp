/**
 * The gallery deck's art library (Yawp! Lesson Deck Kit, "Art"). One work per
 * lesson, never text on the art, always credited. Only works whose image
 * ships with the app are listed, so the planner never names a painting a
 * slide cannot hang.
 */
import type { DeckAccent } from './slide-deck';

export type DeckArt = {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Under the app's public folder. */
  src: string;
  /** The line under the art, wherever it hangs. */
  credit: string;
  /** The accent the work suggests for its unit. */
  accent: DeckAccent;
  /** What the work is about, for the planner to match against a lesson. */
  themes: string[];
};

export const DECK_ART: DeckArt[] = [
  {
    id: 'turner-temeraire',
    title: 'The Fighting Temeraire',
    artist: 'J. M. W. Turner',
    year: '1839',
    src: '/lesson-planner/art/turner-temeraire.jpg',
    credit: 'J. M. W. Turner, The Fighting Temeraire, 1839. Oil on canvas. National Gallery, London.',
    accent: 'ember',
    themes: ['war', 'memory', 'loss', 'carrying', 'endings', 'change', 'age'],
  },
];

export function deckArt(id: string | null | undefined): DeckArt | null {
  if (!id) return null;
  return DECK_ART.find((art) => art.id === id) ?? null;
}
