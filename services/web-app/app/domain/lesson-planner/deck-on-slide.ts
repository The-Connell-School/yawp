/**
 * Editing a deck on the slide itself (the deck studio, Nov 19; Brian, Nov 18:
 * "click the headline, label, or body and type").
 *
 * The kit's layout marks each run with the field its words came from
 * (`KitV4Source`). These are the pure edits behind that: what the teacher
 * typed into a run goes back to that field, a list gains or loses a line, and
 * the deck that comes back is one the editor can still save. Nothing here
 * touches the database or the DOM.
 */
import { colorMarkSegments, withColorMarkSegment } from './deck-colors';
import { planKitV4Deck, type KitV4Source } from './deck-kit-v4';
import { validateSlideDeck, type Slide, type SlideDeck } from './slide-deck';

/** The schema's limits (slide-deck.ts), by field. */
const TEXT_LIMITS: Record<string, number> = {
  title: 90,
  subtitle: 200,
  body: 320,
  question: 320,
  stem: 160,
  grouping: 40,
  followUp: 200,
  routine: 60,
  attribution: 200,
  author: 80,
  work: 120,
  page: 20,
  course: 80,
  teacher: 80,
  mode: 24,
  button: 40,
  nextLesson: 90,
};
const DECK_LIMITS: Record<string, number> = { title: 90, subtitle: 200, unit: 80 };
const COLUMN_LIMITS: Record<string, number> = { label: 40, text: 320 };

type ListSpec = {
  /** The most the kit draws. */
  max: number;
  /** A line of words, or the limit of each part of an item. */
  limit?: number;
  parts?: Record<string, number>;
  /** What a new line holds until the teacher types over it. */
  blank: () => unknown;
  /** The part to type in first. */
  focusKey?: string;
  /** What a screen reader calls item N (and its part). */
  label: (n: number, key?: string) => string;
};

const LISTS: Record<string, ListSpec> = {
  bullets: { max: 7, limit: 200, blank: () => 'New line', label: (n) => `Line ${n}` },
  facts: { max: 3, limit: 200, blank: () => 'New line', label: (n) => `Line ${n}` },
  choices: { max: 5, limit: 200, blank: () => 'New choice', label: (n) => `Choice ${n}` },
  agenda: { max: 6, parts: { title: 70 }, blank: () => ({ title: 'New part' }), focusKey: 'title', label: (n) => `Agenda part ${n}` },
  tasks: {
    // The schema holds four; the kit draws three.
    max: 3,
    parts: { verb: 24, text: 160 },
    blank: () => ({ verb: 'Mark', text: 'what to look for' }),
    focusKey: 'text',
    label: (n, key) => (key === 'verb' ? `Task ${n} verb` : `Task ${n}`),
  },
  timeline: {
    max: 5,
    parts: { year: 14, caption: 70 },
    blank: () => ({ year: 'Year', caption: 'What happened' }),
    focusKey: 'caption',
    label: (n, key) => (key === 'year' ? `Year ${n}` : `Event ${n}`),
  },
};

const TEXT_LABELS: Record<string, string> = {
  title: 'Slide title',
  subtitle: 'Subtitle',
  body: 'Slide text',
  question: 'Question',
  stem: 'Sentence stem',
  grouping: 'Grouping',
  followUp: 'Follow-up',
  routine: 'Routine',
  attribution: 'Attribution',
  author: 'Author',
  work: 'Work',
  page: 'Page',
  course: 'Class and date',
  teacher: 'Teacher',
  mode: 'Label',
  button: 'Button',
  nextLesson: 'Next lesson',
};
const DECK_LABELS: Record<string, string> = { title: 'Deck title', subtitle: 'Deck subtitle', unit: 'Unit' };

const isColumn = (source: KitV4Source) => source.index === undefined && Boolean(source.key) && (source.field === 'left' || source.field === 'right');

/** One name per field, item, part and color part: the run's key on the canvas. */
export function sourceKey(source: KitV4Source): string {
  return (
    `${source.on}.${source.field}` +
    (source.index === undefined ? '' : `.${source.index}`) +
    (source.key ? `.${source.key}` : '') +
    (source.segment === undefined ? '' : `#${source.segment}`)
  );
}

/** What a screen reader calls the box: "Slide title", "Line 2", "Label". */
export function sourceLabel(source: KitV4Source): string {
  const part = source.segment === undefined ? '' : `, part ${source.segment + 1}`;
  if (source.on === 'deck') return (DECK_LABELS[source.field] ?? 'Deck text') + part;
  const list = LISTS[source.field];
  if (list && source.index !== undefined) return list.label(source.index + 1, source.key) + part;
  if (isColumn(source)) return `${source.field === 'left' ? 'Left' : 'Right'} column ${source.key === 'label' ? 'label' : 'text'}${part}`;
  return (TEXT_LABELS[source.field] ?? 'Slide text') + part;
}

/** The most characters the field holds. */
export function sourceLimit(source: KitV4Source): number {
  if (source.on === 'deck') return DECK_LIMITS[source.field] ?? 90;
  const list = LISTS[source.field];
  if (list && source.index !== undefined) return (source.key ? list.parts?.[source.key] : list.limit) ?? 200;
  if (isColumn(source)) return COLUMN_LIMITS[source.key!] ?? 320;
  return TEXT_LIMITS[source.field] ?? 200;
}

/** The field's stored words: the whole line, marks and all. */
function stored(deck: SlideDeck, slideIndex: number, source: KitV4Source): string | undefined {
  const holder = (source.on === 'deck' ? deck : deck.slides[slideIndex]) as Record<string, unknown> | undefined;
  let value: unknown = holder?.[source.field];
  if (source.index !== undefined) value = (value as unknown[] | undefined)?.[source.index];
  if (source.key) value = (value as Record<string, unknown> | undefined)?.[source.key];
  return typeof value === 'string' ? value : undefined;
}

/** The words the run shows: the field's, or its one color part's. */
export function sourceText(deck: SlideDeck, slideIndex: number, source: KitV4Source): string | undefined {
  const line = stored(deck, slideIndex, source);
  if (line === undefined || source.segment === undefined) return line;
  return colorMarkSegments(line)[source.segment]?.text;
}

function withSlide(deck: SlideDeck, slideIndex: number, slide: Slide): SlideDeck {
  return { ...deck, slides: deck.slides.map((old, at) => (at === slideIndex ? slide : old)) };
}

/** The deck with the field's stored line set; null when the field is not there to set. */
function write(deck: SlideDeck, slideIndex: number, source: KitV4Source, line: string): SlideDeck | null {
  if (source.on === 'deck') return { ...deck, [source.field]: line || undefined };
  const slide = deck.slides[slideIndex] as (Slide & Record<string, unknown>) | undefined;
  if (!slide) return null;
  if (source.index !== undefined) {
    const list = [...((slide[source.field] as unknown[] | undefined) ?? [])];
    const item = list[source.index];
    if (item === undefined) return null;
    list[source.index] = source.key ? { ...(item as object), [source.key]: line } : line;
    return withSlide(deck, slideIndex, { ...slide, [source.field]: list } as Slide);
  }
  if (source.key) {
    const column = slide[source.field] as Record<string, string> | undefined;
    if (!column) return null;
    return withSlide(deck, slideIndex, { ...slide, [source.field]: { ...column, [source.key]: line } } as Slide);
  }
  // A slide with its label taken off says so: left out, the template's own comes back.
  if (source.field === 'mode') return withSlide(deck, slideIndex, { ...slide, mode: line || 'none' } as Slide);
  return withSlide(deck, slideIndex, { ...slide, [source.field]: line || undefined } as Slide);
}

/** The editor can still save it: the same check the Save button meets. */
function stillSaves(deck: SlideDeck): boolean {
  return validateSlideDeck(JSON.stringify(deck)).ok;
}

/**
 * The deck with what the teacher typed into a run. One line per field, held
 * to the field's limit. Emptied, an optional field is cleared; where that
 * would leave a slide the editor cannot save (a title, a big idea's text, a
 * list line), the deck comes back as it was.
 */
export function applySlideText(deck: SlideDeck, slideIndex: number, source: KitV4Source, typed: string): SlideDeck {
  let words = typed.replace(/\s+/g, ' ');
  const limit = sourceLimit(source);
  let line: string;
  if (source.segment === undefined) {
    line = words.slice(0, limit);
  } else {
    // A tilde would break the mark it sits in.
    if (words.includes('~')) return deck;
    const current = stored(deck, slideIndex, source) ?? '';
    line = withColorMarkSegment(current, source.segment, words);
    if (line.length > limit) {
      words = words.slice(0, Math.max(0, words.length - (line.length - limit)));
      line = withColorMarkSegment(current, source.segment, words);
    }
  }
  const empty = !line.trim();
  const next = write(deck, slideIndex, source, empty ? '' : line);
  if (!next) return deck;
  return !empty || stillSaves(next) ? next : deck;
}

/** The most lines of this list the slide's template draws. */
function drawn(deck: SlideDeck, slideIndex: number, field: string): number {
  const spec = LISTS[field]!;
  if (field !== 'bullets') return spec.max;
  const template = planKitV4Deck(deck)[slideIndex]?.template;
  if (template === 'steps') return 4;
  if (template === 'notes' || template === 'read' || template === 'excerpt') return 3;
  if (template === 'agenda') return 6;
  return spec.max;
}

export type SlideListEdit = { deck: SlideDeck; focus: KitV4Source | null };

/** Enter in a list line: a new line after it, to type in next. Null: no room, or not a list. */
export function insertSlideListItem(deck: SlideDeck, slideIndex: number, source: KitV4Source): SlideListEdit | null {
  const spec = source.on === 'slide' && source.index !== undefined ? LISTS[source.field] : undefined;
  const slide = deck.slides[slideIndex] as (Slide & Record<string, unknown>) | undefined;
  if (!spec || !slide) return null;
  const list = [...((slide[source.field] as unknown[] | undefined) ?? [])];
  if (source.index! >= list.length || list.length >= drawn(deck, slideIndex, source.field)) return null;
  list.splice(source.index! + 1, 0, spec.blank());
  return {
    deck: withSlide(deck, slideIndex, { ...slide, [source.field]: list } as Slide),
    focus: { on: 'slide', field: source.field, index: source.index! + 1, ...(spec.focusKey ? { key: spec.focusKey } : {}) },
  };
}

/** Backspace in an empty list line: the line goes. Null: the slide needs it, or not a list. */
export function removeSlideListItem(deck: SlideDeck, slideIndex: number, source: KitV4Source): SlideListEdit | null {
  const spec = source.on === 'slide' && source.index !== undefined ? LISTS[source.field] : undefined;
  const slide = deck.slides[slideIndex] as (Slide & Record<string, unknown>) | undefined;
  if (!spec || !slide) return null;
  const list = [...((slide[source.field] as unknown[] | undefined) ?? [])];
  if (source.index! >= list.length) return null;
  list.splice(source.index!, 1);
  const next = withSlide(deck, slideIndex, { ...slide, [source.field]: list.length ? list : undefined } as Slide);
  if (!stillSaves(next)) return null;
  return {
    deck: next,
    focus: list.length
      ? { on: 'slide', field: source.field, index: Math.max(0, source.index! - 1), ...(spec.focusKey ? { key: spec.focusKey } : {}) }
      : null,
  };
}
