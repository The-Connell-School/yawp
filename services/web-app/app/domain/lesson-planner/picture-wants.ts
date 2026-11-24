/**
 * A picture on every teaching slide (Kevin, Nov 22: dual coding). The pure
 * half: which pictures a deck still wants, and the deck with found pictures
 * put where they were asked for. Finding them is `picture-lookup.server.ts`.
 */
import type { Slide, SlideDeck } from './slide-deck';

export type WantedPicture = {
  subject: string;
  shows?: string;
  find?: string;
  own?: true;
};

/** `own`: only the subject's own article will do (a name that leads to a novel or a flower is not that person). */
type Want = { subject: string; shows?: string; find?: string; own?: true };
type Person = NonNullable<Slide['people']>[number];
type Event = NonNullable<Slide['events']>[number];

/**
 * What a person or an event stands for when the planner did not say (live
 * preview, Nov 22: two requests in a 13-slide deck). A person is their own
 * name. An event is whatever Wikipedia's search makes of its title and date
 * ("The Rosenbergs executed 1953"), since an event's title is rarely an
 * article's. The deck itself is not changed: these are asked, never saved.
 */
const personWant = (person: Person): Want | undefined =>
  person.wants ??
  (person.name.trim() ? { subject: person.name.trim(), own: true } : undefined);
const eventWant = (event: Event): Want | undefined =>
  event.wants ??
  (event.title.trim()
    ? {
        subject: event.title.trim(),
        find: [event.title, event.date].filter(Boolean).join(' ').trim(),
      }
    : undefined);

/** A subject as it is compared: case, accents and spacing aside. */
export function pictureKey(subject: string): string {
  return subject
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

/**
 * Every picture the deck asks for and does not have yet, once per subject:
 * what the planner asked for first, in slide order, then what its people and
 * events stand for.
 */
export function wantedPictures(
  deck: Pick<SlideDeck, 'slides'>
): WantedPicture[] {
  const seen = new Set<string>();
  const wanted: WantedPicture[] = [];
  const ask = (want: Want | undefined, has: string | undefined) => {
    if (!want || has) return;
    const key = pictureKey(want.subject);
    if (!key || seen.has(key)) return;
    seen.add(key);
    wanted.push({
      subject: want.subject,
      ...(want.shows ? { shows: want.shows } : {}),
      ...(want.find ? { find: want.find } : {}),
      ...(want.own ? { own: true as const } : {}),
    });
  };
  for (const slide of deck.slides) {
    ask(slide.wants, slide.image);
    for (const event of slide.events ?? []) ask(event.wants, event.image);
    for (const scene of slide.scenes ?? []) ask(scene.wants, scene.image);
    for (const person of slide.people ?? []) ask(person.wants, person.image);
  }
  for (const slide of deck.slides) {
    for (const event of slide.events ?? [])
      if (!event.wants) ask(eventWant(event), event.image);
    for (const person of slide.people ?? [])
      if (!person.wants) ask(personWant(person), person.image);
  }
  return wanted;
}

/**
 * What the slide says beside each subject it asks for (the first slide,
 * event or person to ask), for the second look to judge the picture against.
 */
export function pictureWords(
  deck: Pick<SlideDeck, 'slides'>
): Map<string, string> {
  const words = new Map<string, string>();
  const note = (want: Want | undefined, text: Array<string | undefined>) => {
    if (!want) return;
    const key = pictureKey(want.subject);
    if (!key || words.has(key)) return;
    const said = text
      .filter(
        (part): part is string =>
          typeof part === 'string' && Boolean(part.trim())
      )
      .join(' ');
    words.set(key, said.length > 300 ? `${said.slice(0, 299)}…` : said);
  };
  for (const slide of deck.slides) {
    note(slide.wants, [
      slide.title,
      slide.body,
      ...(slide.facts ?? []),
      slide.question,
    ]);
    for (const event of slide.events ?? [])
      note(eventWant(event), [
        slide.title,
        `${event.date}: ${event.title}.`,
        event.detail,
      ]);
    for (const person of slide.people ?? [])
      note(personWant(person), [
        slide.title,
        `${person.name}${person.role ? `, ${person.role}` : ''}.`,
        person.note,
      ]);
    for (const scene of slide.scenes ?? []) note(scene.wants, [slide.title, `${scene.label}.`, scene.note]);
  }
  return words;
}

/**
 * The deck with each found picture where it was asked for: on the slide, the
 * event or the person. A person slide shows only its people's pictures, so a
 * picture asked for on the slide itself goes to the person it names (or the
 * first one without a picture).
 */
export function withFoundPictures<T extends SlideDeck>(
  deck: T,
  found: Map<string, string>
): T {
  if (!found.size) return deck;
  const idFor = (want: Want | undefined, has: string | undefined) =>
    want && !has ? found.get(pictureKey(want.subject)) : undefined;
  // One picture, one slide (visuals review, Nov 22: the same photograph on
  // two slides of a deck, in 13 of 25 reviews). The first slide to ask for a
  // subject shows it; a later slide asking again goes without, and without a
  // "picture to add" note for a picture the deck already has.
  const shown = new Set<string>(deck.slides.flatMap((slide) => (slide.image ? [slide.image] : [])));
  return {
    ...deck,
    slides: deck.slides.map((slide): Slide => {
      const again = slide.layout !== 'person' && !slide.image && slide.wants ? idFor(slide.wants, undefined) : undefined;
      if (again && shown.has(again)) {
        const { wants: _asked, ...rest } = slide;
        return rest as Slide;
      }
      if (again) shown.add(again);
      const events = slide.events?.map((event) => {
        const eventImage = idFor(eventWant(event), event.image);
        return eventImage ? { ...event, image: eventImage } : event;
      });
      // A world slide's pictures (Kevin, Nov 23), each where it was asked for.
      const scenes = slide.scenes?.map((scene) => {
        const sceneImage = idFor(scene.wants, scene.image);
        return sceneImage ? { ...scene, image: sceneImage } : scene;
      });
      let people = slide.people?.map((person) => {
        const personImage = idFor(personWant(person), person.image);
        return personImage ? { ...person, image: personImage } : person;
      });
      let image = idFor(slide.wants, slide.image);
      if (slide.layout === 'person' && people?.length) {
        const own =
          image ??
          (slide.image && !slide.people?.some((person) => person.image)
            ? slide.image
            : undefined);
        if (own && !people.some((person) => person.image === own)) {
          const key = pictureKey(slide.wants?.subject ?? '');
          const named = people.findIndex(
            (person) =>
              !person.image &&
              key &&
              (pictureKey(person.name).includes(key) ||
                key.includes(pictureKey(person.name)))
          );
          const at =
            named >= 0 ? named : people.findIndex((person) => !person.image);
          if (at >= 0)
            people = people.map((person, i) =>
              i === at ? { ...person, image: own } : person
            );
        }
        image = undefined;
      }
      return {
        ...slide,
        ...(image ? { image } : {}),
        ...(events ? { events } : {}),
        ...(scenes ? { scenes } : {}),
        ...(people ? { people } : {}),
      };
    }),
  };
}

/**
 * A picture slide is nothing without its picture. One whose picture was not
 * found becomes its own question for the class (or its title as a statement),
 * still wanting the picture, so no one projects an empty frame.
 */
export function withoutEmptyPictureSlides<T extends SlideDeck>(deck: T): T {
  if (!deck.slides.some((slide) => slide.layout === 'picture' && !slide.image))
    return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide): Slide => {
      if (slide.layout !== 'picture' || slide.image) return slide;
      const asked = slide.question ?? slide.body;
      return asked
        ? { ...slide, layout: 'discuss', question: asked }
        : { ...slide, layout: 'big_idea', body: slide.title };
    }),
  };
}

/** The line a slide's notes carry for a picture asked for and not found. */
export const PICTURE_SLOT_LEAD = 'Picture to add:';

/**
 * A picture asked for and not found is a labeled slot, not a quiet gap (R10;
 * 13-lesson review, Nov 22: the Hurston portrait and the Atticus still the
 * planner asked for vanished). The slide's speaker notes say which picture
 * goes there, where the teacher sees it in the studio and the printed notes
 * and students do not.
 */
export function withPictureSlots<T extends SlideDeck>(deck: T): T {
  if (!deck.slides.some((slide) => slide.wants && !slide.image)) return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide): Slide => {
      if (
        !slide.wants ||
        slide.image ||
        // A person slide's picture goes to its person (rules test, Nov 23:
        // "Picture to add: Zora Neale Hurston" under her own portrait).
        slide.people?.some((person) => person.image) ||
        (slide.speakerNotes ?? '').includes(PICTURE_SLOT_LEAD)
      )
        return slide;
      const what = `${slide.wants.subject}${slide.wants.shows ? ` (${slide.wants.shows})` : ''}`;
      const line = `${PICTURE_SLOT_LEAD} ${what}. Yawp! could not find one it could use; add your own in the deck studio.`;
      return {
        ...slide,
        speakerNotes: slide.speakerNotes
          ? `${slide.speakerNotes.trim()}\n\n${line}`
          : line,
      };
    }),
  };
}
