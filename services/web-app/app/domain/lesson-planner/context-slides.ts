/**
 * Background for a text (Kevin, Nov 19): the two slides a teacher steps
 * through when introducing a book, a timeline and a map.
 *
 * Both are "stepped": in Present the arrows move through the events or the
 * places one at a time, and the one in focus is drawn in full. These are the
 * pure helpers every surface shares: how many steps a slide has, the deck
 * with one in focus (never stored), and the same slide as a plain list for
 * the older looks that do not draw a line or a map.
 */
import { diagramLines, type Slide, type SlideDeck } from './slide-deck';

export const CONTEXT_LAYOUTS = ['timeline', 'map'] as const;

/** How many things the arrows step through on this slide; 0 for an ordinary slide. */
export function slideSteps(slide: Pick<Slide, 'layout' | 'events' | 'places'>): number {
  if (slide.layout === 'timeline') return slide.events?.length ?? 0;
  if (slide.layout === 'map') return slide.places?.length ?? 0;
  return 0;
}

/** The deck with one slide's event or place in focus (undefined: the overview). Render-only. */
export function withSlideFocus<T extends SlideDeck>(deck: T, index: number, focus: number | undefined): T {
  const slide = deck.slides[index];
  if (!slide) return deck;
  const steps = slideSteps(slide);
  const next = focus === undefined || !steps ? undefined : Math.max(0, Math.min(steps - 1, focus));
  if (slide.focus === next) return deck;
  return { ...deck, slides: deck.slides.map((old, at) => (at === index ? { ...old, focus: next } : old)) };
}

/**
 * Where the arrows go next on a stepped slide: the next (or previous) step,
 * or `'leave'` when the slide is done. The overview is before the first step.
 */
export function nextFocus(slide: Pick<Slide, 'layout' | 'events' | 'places'>, focus: number | undefined, delta: 1 | -1): number | undefined | 'leave' {
  const steps = slideSteps(slide);
  if (!steps) return 'leave';
  if (delta === 1) {
    if (focus === undefined) return 0;
    return focus + 1 < steps ? focus + 1 : 'leave';
  }
  if (focus === undefined) return 'leave';
  return focus === 0 ? undefined : focus - 1;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * A timeline, a map, a define, a person or a diagram slide as a `notes` slide
 * (dated lines, places, words, people or parts, each in a line), for the spec
 * v3 look. Any other slide comes back as itself.
 */
export function legacyContextSlide(slide: Slide): Slide {
  if (slide.layout === 'timeline') {
    const { events, tracks: _tracks, ...rest } = slide;
    return {
      ...rest,
      layout: 'notes',
      timeline: (events ?? []).slice(0, 5).map((event) => ({ year: clip(event.date, 14), caption: clip(event.title, 70) })),
    };
  }
  if (slide.layout === 'map') {
    const { places, shade: _shade, shadeLabel: _shadeLabel, route: _route, view: _view, ...rest } = slide;
    return {
      ...rest,
      layout: 'notes',
      facts: (places ?? []).slice(0, 3).map((place) => clip(`${place.label ?? place.name}${place.note ? `: ${place.note}` : ''}`, 200)),
    };
  }
  if (slide.layout === 'define') {
    const { terms, ...rest } = slide;
    return { ...rest, layout: 'notes', facts: (terms ?? []).slice(0, 3).map((term) => clip(`${term.word}: ${term.definition}`, 200)) };
  }
  if (slide.layout === 'person') {
    const { people, ...rest } = slide;
    return { ...rest, layout: 'notes', facts: (people ?? []).slice(0, 3).map((person) => clip(`${person.name}: ${person.role}`, 200)) };
  }
  if (slide.layout === 'diagram') {
    // A notes slide holds three lines: a longer diagram shares them out in
    // order, so the sonnet keeps its couplet.
    const { diagram, ...rest } = slide;
    const lines = diagramLines({ diagram });
    const per = Math.ceil(lines.length / 3);
    const facts = [0, 1, 2].map((i) => clip(lines.slice(i * per, (i + 1) * per).join('; '), 200)).filter(Boolean);
    return facts.length ? { ...rest, layout: 'notes', facts } : slide;
  }
  return slide;
}
