/**
 * What the reply says is what was made (round 4, Nov 22). The planner talked
 * to the teacher about its own choice of painting ("Hokusai's Great Wave fits
 * that, but it was used in your Macbeth unit, so I'm going with the Degas")
 * and described paintings the deck does not have. A paragraph of the reply's
 * prose that weighs paintings against the teacher's other lessons, or that
 * describes a painting when the deck has none, is taken out. Nothing inside a
 * fenced block is touched.
 */
import { fenceSlideDeck, readSlideDeck, type SlideDeck } from './slide-deck';

const PAINTING = /\b(painting|paintings|artwork|Hokusai|Great Wave|Degas|Bruegel|van Gogh|Monet|Turner|Vermeer|Rembrandt|Caravaggio|Hopper|Fuseli)\b/i;
const OTHER_LESSONS = /\bused (?:it |that )?in your\b|\bused (?:it |that )?(?:last|earlier)\b|\balready used\b/i;
const ON_THE_DECK = /\b(deck|title slide|slides?|opening slide)\b/i;

const PAINTING_IN_NOTES = /\b(the painting|this painting|Hokusai|Great Wave|Degas|Bruegel|van Gogh|Monet|Turner|Vermeer|Rembrandt|Caravaggio|Hopper)\b/i;

/**
 * A deck with no painting has no speaker notes about one ("The painting
 * beside the title is Bruegel's Children's Games", under a title slide that
 * shows Lorraine Hansberry: preview, Nov 22). The sentences that talk about
 * it are taken out; notes left empty say only to let students settle.
 */
function withoutPaintingNotes(deck: SlideDeck): SlideDeck | null {
  if (deck.art) return null;
  let changed = false;
  const slides = deck.slides.map((slide) => {
    // A slide that studies a picture of its own may well be about a painting.
    if (slide.image || slide.wants || slide.layout === 'look' || slide.layout === 'picture' || !PAINTING_IN_NOTES.test(slide.speakerNotes ?? '')) return slide;
    const kept = (slide.speakerNotes ?? '')
      .split(/(?<=[.!?]["'”’)]*)\s+/)
      .filter((sentence) => !PAINTING_IN_NOTES.test(sentence) && !/\b(it will land on its own|say this aloud)\b/i.test(sentence))
      .join(' ')
      .trim();
    changed = true;
    return { ...slide, speakerNotes: kept || 'Give students a moment to settle before you begin.' };
  });
  return changed ? { ...deck, slides } : null;
}

export function withoutArtTalk(replyIn: string): string {
  let reply = replyIn;
  const first = readSlideDeck(reply);
  const cleaned = first.kind === 'deck' ? withoutPaintingNotes(first.deck) : null;
  if (first.kind === 'deck' && cleaned) reply = `${first.body.trim()}\n\n${fenceSlideDeck(cleaned)}`;
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
