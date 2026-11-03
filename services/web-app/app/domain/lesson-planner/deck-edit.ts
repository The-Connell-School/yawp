/**
 * Editing a deck by hand (Brian's review, E2).
 *
 * A teacher may not use every step, so removing a slide has to be one click.
 * These are the pure edits behind the deck editor; nothing here touches the
 * database. Each returns a new deck and leaves the one it was given alone.
 */
import {
  validateSlideDeck,
  type Slide,
  type SlideDeck,
} from './slide-deck';

export function deleteSlide(deck: SlideDeck, index: number): SlideDeck {
  // A deck with nothing in it is not a deck; the last slide stays.
  if (deck.slides.length <= 1) return deck;
  return { ...deck, slides: deck.slides.filter((_, at) => at !== index) };
}

export function moveSlide(
  deck: SlideDeck,
  index: number,
  by: -1 | 1
): SlideDeck {
  const to = index + by;
  if (to < 0 || to >= deck.slides.length) return deck;
  const slides = [...deck.slides];
  [slides[index], slides[to]] = [slides[to]!, slides[index]!];
  return { ...deck, slides };
}

export function duplicateSlide(deck: SlideDeck, index: number): SlideDeck {
  const slide = deck.slides[index];
  if (!slide) return deck;
  const slides = [...deck.slides];
  slides.splice(index + 1, 0, structuredClone(slide));
  return { ...deck, slides };
}

export function updateSlide(
  deck: SlideDeck,
  index: number,
  patch: Partial<Slide>
): SlideDeck {
  return {
    ...deck,
    slides: deck.slides.map((slide, at) =>
      at === index ? ({ ...slide, ...patch } as Slide) : slide
    ),
  };
}

/** Check what the editor sends back against the same rules a planner deck meets. */
export function deckFromEditor(
  json: string
): { ok: true; deck: SlideDeck } | { ok: false; error: string } {
  const validation = validateSlideDeck(json);
  return validation.ok
    ? { ok: true, deck: validation.deck }
    : { ok: false, error: validation.reason };
}
