/**
 * A picture on every teaching slide (Kevin, Nov 22: dual coding). The pure
 * half: which pictures a deck still wants, and the deck with found pictures
 * put where they were asked for. Finding them is `picture-lookup.server.ts`.
 */
import type { Slide, SlideDeck } from './slide-deck';

export type WantedPicture = { subject: string; shows?: string };

/** A subject as it is compared: case, accents and spacing aside. */
export function pictureKey(subject: string): string {
  return subject
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

/** Every picture the deck asks for and does not have yet, once per subject, in slide order. */
export function wantedPictures(deck: Pick<SlideDeck, 'slides'>): WantedPicture[] {
  const seen = new Set<string>();
  const wanted: WantedPicture[] = [];
  const ask = (want: { subject: string; shows?: string } | undefined, has: string | undefined) => {
    if (!want || has) return;
    const key = pictureKey(want.subject);
    if (!key || seen.has(key)) return;
    seen.add(key);
    wanted.push({ subject: want.subject, ...(want.shows ? { shows: want.shows } : {}) });
  };
  for (const slide of deck.slides) {
    ask(slide.wants, slide.image);
    for (const event of slide.events ?? []) ask(event.wants, event.image);
    for (const person of slide.people ?? []) ask(person.wants, person.image);
  }
  return wanted;
}

/** The deck with each found picture on the slides and events that asked for its subject. */
export function withFoundPictures<T extends SlideDeck>(deck: T, found: Map<string, string>): T {
  if (!found.size) return deck;
  const idFor = (want: { subject: string } | undefined, has: string | undefined) => (want && !has ? found.get(pictureKey(want.subject)) : undefined);
  return {
    ...deck,
    slides: deck.slides.map((slide): Slide => {
      const image = idFor(slide.wants, slide.image);
      const events = slide.events?.map((event) => {
        const eventImage = idFor(event.wants, event.image);
        return eventImage ? { ...event, image: eventImage } : event;
      });
      const people = slide.people?.map((person) => {
        const personImage = idFor(person.wants, person.image);
        return personImage ? { ...person, image: personImage } : person;
      });
      return { ...slide, ...(image ? { image } : {}), ...(events ? { events } : {}), ...(people ? { people } : {}) };
    }),
  };
}

/**
 * A picture slide is nothing without its picture. One whose picture was not
 * found becomes its own question for the class (or its title as a statement),
 * still wanting the picture, so no one projects an empty frame.
 */
export function withoutEmptyPictureSlides<T extends SlideDeck>(deck: T): T {
  if (!deck.slides.some((slide) => slide.layout === 'picture' && !slide.image)) return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide): Slide => {
      if (slide.layout !== 'picture' || slide.image) return slide;
      const asked = slide.question ?? slide.body;
      return asked ? { ...slide, layout: 'discuss', question: asked } : { ...slide, layout: 'big_idea', body: slide.title };
    }),
  };
}
