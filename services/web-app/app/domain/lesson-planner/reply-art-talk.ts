/**
 * What the reply says is what was made (round 4, Nov 22). The planner talked
 * to the teacher about its own choice of painting ("Hokusai's Great Wave fits
 * that, but it was used in your Macbeth unit, so I'm going with the Degas")
 * and described paintings the deck does not have. A paragraph of the reply's
 * prose that weighs paintings against the teacher's other lessons, or that
 * describes a painting when the deck has none, is taken out. Nothing inside a
 * fenced block is touched.
 */
import { readSlideDeck } from './slide-deck';

const PAINTING = /\b(painting|paintings|artwork|Hokusai|Great Wave|Degas|Bruegel|van Gogh|Monet|Turner|Vermeer|Rembrandt|Caravaggio|Hopper|Fuseli)\b/i;
const OTHER_LESSONS = /\bused (?:it |that )?in your\b|\bused (?:it |that )?(?:last|earlier)\b|\balready used\b/i;
const ON_THE_DECK = /\b(deck|title slide|slides?|opening slide)\b/i;

export function withoutArtTalk(reply: string): string {
  const outcome = readSlideDeck(reply);
  const deckHasArt = outcome.kind === 'deck' && Boolean(outcome.deck.art);
  const parts = reply.split(/(\n```[\s\S]*?\n```)/);
  let changed = false;
  const kept = parts.map((part) => {
    if (part.startsWith('\n```')) return part;
    const paragraphs = part.split(/\n{2,}/);
    const left = paragraphs.filter((paragraph) => {
      if (!PAINTING.test(paragraph) || /^\s*#/.test(paragraph)) return true;
      const talk = OTHER_LESSONS.test(paragraph) || (!deckHasArt && ON_THE_DECK.test(paragraph));
      if (talk) changed = true;
      return !talk;
    });
    return left.join('\n\n');
  });
  return changed ? kept.join('') : reply;
}
