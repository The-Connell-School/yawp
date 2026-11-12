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

/** A single piece of text a slide can carry, and the layouts it belongs to. */
export type SlideTextField = {
  key: 'subtitle' | 'body' | 'question' | 'followUp' | 'stem' | 'grouping' | 'routine' | 'accentWord' | 'attribution' | 'author' | 'work' | 'page' | 'part' | 'teacher' | 'course' | 'mode' | 'button' | 'nextLesson';
  label: string;
  max: number;
  long?: boolean;
  layouts?: Slide['layout'][];
};

/** In the order the editor shows them. */
export const SLIDE_TEXT_FIELDS: SlideTextField[] = [
  { key: 'subtitle', label: 'Subtitle', max: 200, layouts: ['title'] },
  {
    key: 'body',
    label: 'Text',
    max: 320,
    long: true,
    layouts: ['statement', 'prompt', 'quote', 'closing', 'big_idea', 'write', 'excerpt', 'exit', 'picture'],
  },
  { key: 'question', label: 'Question', max: 320, long: true, layouts: ['discuss', 'look', 'picture'] },
  { key: 'followUp', label: 'Follow-up', max: 200 },
  { key: 'stem', label: 'Sentence stem', max: 160 },
  { key: 'grouping', label: 'Grouping', max: 40 },
  { key: 'routine', label: 'Routine', max: 60 },
  { key: 'accentWord', label: 'Word in the accent color', max: 40 },
  { key: 'attribution', label: 'Attribution', max: 200, layouts: ['quote', 'excerpt'] },
  { key: 'author', label: 'Author', max: 80 },
  { key: 'work', label: 'Work', max: 120 },
  { key: 'page', label: 'Page', max: 20 },
  { key: 'part', label: 'Part', max: 12 },
  { key: 'teacher', label: 'Teacher', max: 80 },
  { key: 'course', label: 'Course', max: 80 },
  { key: 'mode', label: 'Label above the slide', max: 24 },
  { key: 'button', label: 'Button', max: 40 },
  { key: 'nextLesson', label: 'Next lesson', max: 90 },
];

/**
 * The text fields to edit on this slide (Brian, Nov 4: "every piece of text
 * on a slide should be editable"): the ones its layout is made of, and any
 * other the slide carries, whatever its layout.
 */
export function slideTextFields(slide: Slide): SlideTextField[] {
  return SLIDE_TEXT_FIELDS.filter(
    (field) => field.layouts?.includes(slide.layout) || (slide[field.key] !== undefined && slide[field.key] !== '')
  );
}

export type SlideListField = 'bullets' | 'agenda' | 'timeline' | 'facts' | 'tasks' | 'choices';

/** The lists to edit on this slide, by the same rule. */
export function slideListFields(slide: Slide): SlideListField[] {
  const byLayout: Partial<Record<Slide['layout'], SlideListField[]>> = {
    bullets: ['bullets'],
    steps: ['bullets'],
    agenda: ['agenda'],
    notes: ['timeline', 'facts'],
    read: ['tasks'],
  };
  const wanted = new Set(byLayout[slide.layout] ?? []);
  for (const key of ['bullets', 'agenda', 'timeline', 'facts', 'tasks', 'choices'] as const) {
    if (slide[key]?.length) wanted.add(key);
  }
  return (['bullets', 'agenda', 'timeline', 'facts', 'tasks', 'choices'] as const).filter((key) => wanted.has(key));
}

const MAX_PICTURE_WORDS = 320;

/** Put a teacher's picture on a slide: a picture slide that keeps its words. */
export function withSlidePicture(slide: Slide, image: string): Slide {
  if (slide.layout === 'picture') return { ...slide, image };
  const words = slide.body ?? (slide.question ? undefined : slide.bullets?.join('; '));
  return {
    ...slide,
    layout: 'picture',
    image,
    ...(words ? { body: words.length > MAX_PICTURE_WORDS ? `${words.slice(0, MAX_PICTURE_WORDS - 1)}…` : words } : {}),
    ...(slide.bullets ? { bullets: undefined } : {}),
  };
}

/** Take the picture off a slide: a text slide, still with its words. */
export function withoutSlidePicture(slide: Slide): Slide {
  const words = slide.body ?? slide.question;
  return words
    ? { ...slide, image: undefined, layout: 'statement', body: words }
    : { ...slide, image: undefined, layout: 'title' };
}
