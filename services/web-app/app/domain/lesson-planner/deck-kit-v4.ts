/**
 * The gallery deck in the Yawp! Lesson Deck Kit, spec v4 (Nov 6, 2026):
 * "a quiet, well-made book with one painting inside it". Cream paper on
 * every slide, Georgia for what students read as an idea, Arial for labels,
 * instructions, credits and facts, everything left-aligned. Color appears in
 * two ways only: a solid deck-color panel on one side of a split slide, or
 * type. No full-color slides, no italic mode words (a short Arial label
 * instead), no hairlines, rules, boxes, small caps, middle dots or roman
 * numerals, no mat around the painting.
 *
 * One layout drives every renderer: `layoutKitV4Slide` places each slide's
 * text, panels, bands and pictures as boxes in kit pixels (1280 × 720), and
 * Present, PowerPoint and the PDFs draw those boxes. A slide's label,
 * headline and body share one text box, so they push each other down, and
 * each column's box is centered top to bottom.
 *
 * Behind `lesson_planner_deck_kit_v4` (with the gallery deck on). A deck is
 * drawn in v4 when it carries `kit: 'v4'`, set where it is loaded
 * (`withDeckKit`); every other deck is drawn in spec v3 (deck-gallery.ts).
 *
 * Spec v4.1 (Nov 11, 2026) is the same layout with four changes, drawn when
 * the deck carries `kit: 'v4.1'` (behind `lesson_planner_deck_kit_v41`, with
 * v4 on): Fraunces Bold for titles and headlines over 40px; no running head,
 * so the lesson's name appears on the title slide only; no label that tells
 * students how to treat the content (Hold this, Know this, Read, Remember);
 * and a title slide that names the teacher, then the class and date, with
 * no "Yawp! Writing Program" line.
 */
import { MAX_HIGHLIGHTS, type Slide, type SlideDeck } from './slide-deck';
import { resolveDeckArt, type DeckArt } from './deck-art';
import { contrastRatio, normalizedHex, splitColorMarks } from './deck-colors';
import { galleryTemplate, withoutLessonNumber, type GalleryTemplate } from './deck-gallery';
import { pictureSlideText } from './deck-pictures';
import { MAP_BOX, fitMapView, inMapView, mapImageSrc, mapPoint, pointArea, type MapSpec } from '~/domain/geo/map-view';

/** Spec v4 color tokens. */
export const KIT_V4 = {
  cream: '#F3F0E8',
  white: '#FFFFFF',
  ink: '#1B1B1B',
  body: '#3A3A3A',
  grey: '#5A5A5A',
  /** Secondary text on a color panel. */
  sand: '#F2DCA8',
  /** Labels and numerals on a color panel, 24px and up. */
  gold: '#E8C062',
  pine: '#1F3532',
} as const;

/** What is not in focus on a stepped slide (a timeline, a map): there, and out of the way. */
const KIT_V4_DIM = '#A29D91';

/** Decks with no art: Pine, Indigo, Olive, Plum, Maroon (Maroon replaces Ember). */
export const KIT_V4_HOUSE_PALETTE = ['#1F3532', '#2F5873', '#56602F', '#7A4560', '#6E1A26'] as const;

/** The kit's own colors for the decks built so far ("Decks built so far"). */
const KIT_V4_ART_COLORS: Record<string, string[]> = {
  'homer-breezing-up': ['#23504A', '#3D4A50'],
  'bruegel-childrens-games': ['#5E1F28', '#2E4B33'],
  'hokusai-great-wave': ['#2F5873', '#1E3A5F'],
  'bierstadt-yosemite-valley': ['#2F4A2E', '#3A4F66'],
  'degas-dance-class': ['#2E6660', '#3A5F8A', '#6E3A55'],
  'turner-temeraire': ['#294457', '#3D4A50'],
  'klee-castle-sun': ['#7E2A2A', '#2B5C8A', '#2E6B3A'],
  'mondrian-composition-rby': ['#23508F', '#A62A26'],
};

/** The legacy accent names, in the house palette (ember is maroon now). */
const LEGACY_ACCENTS_V4: Record<string, string> = {
  ember: '#6E1A26',
  indigo: '#2F5873',
  olive: '#56602F',
  plum: '#7A4560',
};

export const KIT_V4_FONTS = {
  /** Spec v4.1: Fraunces Bold (SOFT 100, WONK 1), for titles and headlines. */
  display: "Fraunces, Georgia, Gelasio, 'Times New Roman', serif",
  serif: "Georgia, Gelasio, 'Times New Roman', serif",
  sans: "Arial, Arimo, 'Liberation Sans', Helvetica, sans-serif",
} as const;

export const KIT_V4_WIDTH = 1280;
export const KIT_V4_HEIGHT = 720;
const MARGIN = 80;
const RUNNING_HEAD_TOP = 48;
/** The split panel: within the kit's 420–660px. */
const PANEL_WIDTH = 520;
const EXCERPT_PANEL_WIDTH = 480;

// Colors ------------------------------------------------------------------

function hue(hex: string): { h: number; s: number; l: number } {
  const value = normalizedHex(hex)!.slice(1);
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, s, l };
}

/**
 * Terracotta, clay, brick, brown: the orange-to-brown hues, which the kit
 * never uses. Deep reds and maroons (hue near 0) stay.
 */
export function isEarthTone(hex: string): boolean {
  const { h, s } = hue(hex);
  return h >= 8 && h <= 50 && s >= 0.12;
}

function darken(hex: string): string {
  const value = normalizedHex(hex)!.slice(1);
  const channels = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) * 0.94);
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Darkened until white reads on it at 4.5:1 and it reads on cream at 4.5:1. */
export function kitV4Readable(hex: string): string {
  let out = normalizedHex(hex)!;
  for (let step = 0; step < 60; step += 1) {
    if (contrastRatio(out, KIT_V4.white) >= 4.5 && contrastRatio(out, KIT_V4.cream) >= 4.5) break;
    out = darken(out);
  }
  return out;
}

/**
 * The deck's two or three colors, the first its primary: its own, else the
 * kit's colors for its painting, else the painting's sampled colors, else the
 * house palette. Earth tones are left out at every step.
 */
export function kitV4Colors(deck: Pick<SlideDeck, 'colors' | 'accent' | 'art'>): string[] {
  const art = resolveDeckArt(deck.art);
  const usable = (list: readonly string[] | undefined | null) =>
    (list ?? [])
      .map((hex) => normalizedHex(hex))
      .filter((hex): hex is string => Boolean(hex) && !isEarthTone(hex!));
  const candidates = [
    usable(deck.colors),
    art ? usable(KIT_V4_ART_COLORS[art.id]) : [],
    art ? usable(art.colors) : [],
    deck.accent ? usable([LEGACY_ACCENTS_V4[deck.accent] ?? '']) : [],
  ];
  const chosen = candidates.find((list) => list.length) ?? [KIT_V4_HOUSE_PALETTE[0], KIT_V4_HOUSE_PALETTE[1]];
  // A single color still gets a second for alternate panels: the house's.
  const filled = chosen.length > 1 ? chosen : [chosen[0]!, chosen[0] === KIT_V4_HOUSE_PALETTE[0] ? KIT_V4_HOUSE_PALETTE[1] : KIT_V4_HOUSE_PALETTE[0]];
  return filled.slice(0, 3).map(kitV4Readable);
}

/** A painting's colors in spec v4: the kit's own, else its sampled colors without earth tones. */
export function kitV4ArtColors(art: Pick<DeckArt, 'id' | 'colors'>): string[] {
  return kitV4Colors({ art: art.id, colors: KIT_V4_ART_COLORS[art.id] ?? art.colors });
}

/** A light band of the deck color on cream, behind a quiz's right answer. */
export function kitV4Band(color: string): string {
  const value = normalizedHex(color)!.slice(1);
  const cream = [0xf3, 0xf0, 0xe8];
  const channels = [0, 2, 4].map((at, i) => {
    const channel = parseInt(value.slice(at, at + 2), 16);
    return Math.round(cream[i]! + (channel - cream[i]!) * 0.2);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

// The plan ----------------------------------------------------------------

/** The gallery's templates, a quiz, the four that give a text its background (Nov 19), and how it is built (Nov 22). */
export type KitV4Template = GalleryTemplate | 'quiz' | 'timeline' | 'map' | 'define' | 'person' | 'diagram';

export type KitV4Plan = {
  slide: Slide;
  template: KitV4Template;
  /** Arial bold, sentence case, no period; null where it would do no job. */
  label: string | null;
  /** The split slide's solid panel, or null for a cream slide. */
  panel: { side: 'left' | 'right'; color: string } | null;
  /** The deck color this slide's type takes on cream. */
  color: string;
  /** A quiz question's place in the deck, and whether this slide shows the answer. */
  quiz: { n: number; of: number; reveal: boolean } | null;
};

const DEFAULT_LABELS: Record<KitV4Template, string | null> = {
  title: null,
  agenda: null,
  steps: 'Do',
  discuss: 'Talk',
  big_idea: 'Hold this',
  write: 'Write',
  notes: 'Know this',
  divider: null,
  read: 'Read',
  look: 'Look',
  picture: 'Look',
  excerpt: 'Annotate',
  exit: 'Before you go',
  compare: null,
  quiz: null,
  timeline: null,
  map: null,
  define: null,
  person: null,
  diagram: null,
};

/** Labels that only decorate. */
const DECORATIVE = new Set(['think', 'begin', 'also', 'next', 'now', 'here']);

/**
 * Spec v4.1: labels that tell students how to treat the content. The slide
 * just gives them the content.
 */
const TREATS_CONTENT = new Set(['hold this', 'know this', 'read', 'remember', 'remember this']);

const PANELS: Partial<Record<KitV4Template, { side: 'left' | 'right'; which: 0 | 1 }>> = {
  steps: { side: 'left', which: 0 },
  read: { side: 'left', which: 0 },
  discuss: { side: 'left', which: 1 },
  notes: { side: 'left', which: 1 },
  excerpt: { side: 'right', which: 0 },
};

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

/** "iv" → 4, "4" → 4; anything else as written. */
function partNumber(part: string): string {
  const cleaned = part.trim().replace(/\.$/, '');
  const roman = ROMAN[cleaned.toLowerCase()];
  return roman ? String(roman) : cleaned;
}

/** "Know this." → "Know this"; "combine." → "Combine". */
function cleanLabel(text: string): string {
  const trimmed = text.trim().replace(/[.:]+$/, '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

function headlineOf(template: KitV4Template, slide: Slide): string {
  if (['steps', 'notes', 'read', 'divider', 'compare', 'title', 'discuss', 'diagram'].includes(template)) return slide.title;
  return slide.question ?? slide.body ?? slide.title;
}

function repeatsHeadline(label: string, template: KitV4Template, slide: Slide): boolean {
  const said = new Set(wordsOf(headlineOf(template, slide)));
  if (/before you go/i.test(label)) return /before you go/i.test(headlineOf(template, slide));
  const words = wordsOf(label).filter((word) => !['this', 'you', 'go', 'before'].includes(word));
  return words.length > 0 && words.every((word) => said.has(word) || said.has(`${word}s`) || said.has(word.replace(/e$/, 'ing')));
}

function labelFor(template: KitV4Template, slide: Slide, previous: string | null, v41: boolean): string | null {
  const own = slide.mode?.trim();
  if (template === 'agenda' || template === 'title') return null;
  if (template === 'exit') return 'Before you go';
  if (own && own.toLowerCase() === 'none') return null;
  if (template === 'divider') {
    if (slide.processStep) return `Step ${slide.processStep}`;
    if (slide.part) return `Part ${partNumber(slide.part)}`;
  }
  const label = own ? cleanLabel(own) : DEFAULT_LABELS[template];
  if (!label) return null;
  if (DECORATIVE.has(label.toLowerCase())) return null;
  if (v41 && TREATS_CONTENT.has(label.toLowerCase())) return null;
  // A label the deck did not ask for is skipped where the headline says it.
  if (!own && repeatsHeadline(label, template, slide)) return null;
  // The task did not change.
  if (label === previous) return null;
  return label;
}

function templateOf(slide: Slide): KitV4Template {
  if (slide.layout === 'timeline' || slide.layout === 'map' || slide.layout === 'define' || slide.layout === 'person') return slide.layout;
  // A diagram with nothing in it to draw is its title, as any slide without its parts is.
  if (slide.layout === 'diagram') return slide.diagram ? 'diagram' : 'big_idea';
  if (slide.choices?.length) return 'quiz';
  return galleryTemplate(slide);
}

/** Every slide's template, label, panel, color and quiz place, in spec v4. */
export function planKitV4Deck(deck: SlideDeck): KitV4Plan[] {
  const colors = kitV4Colors(deck);
  const templates = deck.slides.map(templateOf);
  const v41 = isKitV41(deck);

  // Quiz questions, numbered through the deck; an answer slide that repeats
  // the question before it keeps that question's number.
  const quizNumbers: number[] = [];
  let count = 0;
  let lastQuestion: string | null = null;
  deck.slides.forEach((slide, index) => {
    if (templates[index] !== 'quiz') {
      quizNumbers.push(0);
      lastQuestion = null;
      return;
    }
    const question = (slide.question ?? slide.body ?? slide.title).trim();
    if (question !== lastQuestion) count += 1;
    lastQuestion = question;
    quizNumbers.push(count);
  });

  const plans: KitV4Plan[] = [];
  deck.slides.forEach((slide, index) => {
    const template = templates[index]!;
    const pick = slide.color && colors[slide.color - 1] ? colors[slide.color - 1]! : null;
    const panelSpec = PANELS[template];
    const panel = panelSpec ? { side: panelSpec.side, color: pick ?? colors[panelSpec.which] ?? colors[0]! } : null;
    const quiz = template === 'quiz' ? { n: quizNumbers[index]!, of: count, reveal: Boolean(slide.answer) } : null;
    const previous = plans[plans.length - 1]?.label ?? null;
    plans.push({
      slide,
      template,
      label: quiz ? `Question ${quiz.n} of ${quiz.of}` : labelFor(template, slide, previous, v41),
      panel,
      color: pick ?? colors[0]!,
      quiz,
    });
  });
  return plans;
}

/** Prompt type by its words: 68 up to 12, 54 up to 24, 44 up to 40, then 34. */
export function kitV4PromptSize(text: string): 68 | 54 | 44 | 34 {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 12) return 68;
  if (words <= 24) return 54;
  if (words <= 40) return 44;
  return 34;
}

/** Spec v4.1 prompt type: 64 up to 12 words, 54 up to 24, 44 up to 40, then 34. */
export function kitV41PromptSize(text: string): 64 | 54 | 44 | 34 {
  const size = kitV4PromptSize(text);
  return size === 68 ? 64 : size;
}

// The layout --------------------------------------------------------------

/**
 * Where a run's words live (the deck studio, Nov 19): the field the teacher
 * changes when they type on the slide. Layout words (a numeral, "Today", a
 * minutes line, a credit) have none. Only the canvas in the deck editor reads
 * it; every other renderer draws the run as before.
 */
export type KitV4Source = {
  /** The slide's own field, or the deck's (the unit line on the title slide). */
  on: 'slide' | 'deck';
  field: string;
  /** A list item: bullets[2], agenda[0], tasks[1], choices[3]. */
  index?: number;
  /** A part of an item or a column: agenda[].title, tasks[].verb, left.text. */
  key?: string;
  /** Characters at the start or end of the run's text that are layout, not the field's words. */
  lead?: number;
  trail?: number;
  /** This run is part N of a line with color marks (`colorMarkSegments`). */
  segment?: number;
  /** Written when the teacher leaves the box, not on each key: a label can drop out mid-word. */
  commit?: 'blur';
};

export type KitV4Run = {
  text: string;
  /**
   * `display` is Fraunces Bold (spec v4.1 titles and headlines, over 40px),
   * `serif` Georgia, `sans` Arial.
   */
  face: 'display' | 'serif' | 'sans';
  /** Kit pixels at 1280 wide. */
  size: number;
  color: string;
  /** Arial, and always Fraunces: Georgia is never bold. */
  bold?: boolean;
  /** The field these words came from, where the teacher can type them. */
  source?: KitV4Source;
};

export type KitV4Para = {
  runs: KitV4Run[];
  /** Space after the paragraph, in kit pixels. */
  after?: number;
  /** Line height as a multiple of the largest run. */
  leading?: number;
};

type Box = { x: number; y: number; w: number; h: number };

export type KitV4Element =
  | (Box & {
      kind: 'rect';
      fill: string;
      /** A split slide's panel, a quiz answer's band, a timeline's line or mark or a map's pin, a name's plate on a map, a diagram's block, frame or card. */
      role: 'panel' | 'band' | 'mark' | 'plate' | 'block';
      /** On a stepped slide: the event or place a click on this puts in focus. */
      step?: number;
    })
  | (Box & {
      kind: 'text';
      paras: KitV4Para[];
      valign: 'top' | 'middle' | 'bottom';
      align?: 'left' | 'right';
      role?: 'running-head' | 'credit' | 'timer' | 'body';
      step?: number;
    })
  | (Box & { kind: 'art'; src: string; fit: 'contain' | 'cover'; alt: string })
  | (Box & { kind: 'picture'; id: string })
  /** A map's countries, water and route, drawn by Yawp! from its own map data (Nov 19). */
  | (Box & { kind: 'map'; src: string; alt: string; spec: MapSpec });

export type KitV4SlideLayout = {
  template: KitV4Template;
  background: string;
  elements: KitV4Element[];
};

const serif = (text: string, size: number, color: string): KitV4Run => ({ text, face: 'serif', size, color });
const display = (text: string, size: number, color: string): KitV4Run => ({ text, face: 'display', size, color, bold: true });
const sans = (text: string, size: number, color: string, bold = false): KitV4Run =>
  bold ? { text, face: 'sans', size, color, bold: true } : { text, face: 'sans', size, color };

/** The run, marked with the field its words came from. */
function from<R extends KitV4Run | null | false | undefined>(run: R, source: KitV4Source): R {
  return run ? ({ ...run, source } as R) : run;
}

/** A field of the slide, for `from`. */
const on = (field: string, extra: Omit<KitV4Source, 'on' | 'field'> = {}): KitV4Source => ({ on: 'slide', field, ...extra });

/**
 * A line students read with its color marks: the parts of a thesis, each in
 * its color. Given the line's field, each part knows which part it is.
 */
function marked(
  text: string,
  colors: string[],
  make: (text: string, color: string) => KitV4Run,
  color: string,
  source?: KitV4Source
): KitV4Run[] {
  const parts = splitColorMarks(text, colors);
  const plain = parts.length === 1 && !parts[0]!.color;
  return parts
    .map((part, segment) => ({ part, segment }))
    .filter(({ part }) => part.text)
    .map(({ part, segment }) => {
      const run = make(part.text, part.color ?? color);
      return source ? from(run, plain ? source : { ...source, segment }) : run;
    });
}

/** "See · Think · Wonder" → "See, think, wonder": no middle-dot strings. */
function withoutDots(text: string): string {
  if (!text.includes('·')) return text;
  const parts = text.split(/\s*·\s*/).filter(Boolean);
  return parts.map((part, i) => (i ? part.charAt(0).toLowerCase() + part.slice(1) : part)).join(', ');
}

const para = (runs: (KitV4Run | null | false | undefined)[], after = 0, leading?: number): KitV4Para => ({
  runs: runs.filter((run): run is KitV4Run => Boolean(run && run.text)),
  after,
  ...(leading ? { leading } : {}),
});

const minutesLine = (minutes: number | undefined) => (minutes ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : '');

function credit(art: DeckArt, box: Box): KitV4Element {
  return {
    kind: 'text',
    role: 'credit',
    valign: 'top',
    ...box,
    paras: [para([sans(art.artist, 15, KIT_V4.ink, true), sans(`, ${art.title}, ${art.year}`, 15, KIT_V4.grey)])],
  };
}

function runningHead(deck: SlideDeck, x: number, right = KIT_V4_WIDTH - MARGIN): KitV4Element {
  return {
    kind: 'text',
    role: 'running-head',
    valign: 'top',
    x,
    y: RUNNING_HEAD_TOP,
    w: right - x,
    h: 26,
    paras: [para([sans(withoutLessonNumber(deck.title), 17, KIT_V4.grey)])],
  };
}

/** A box of words. */
export type KitV4Text = Extract<KitV4Element, { kind: 'text' }>;

function column(box: Box, paras: KitV4Para[], valign: 'top' | 'middle' | 'bottom' = 'middle'): KitV4Text {
  return { kind: 'text', role: 'body', valign, ...box, paras: paras.filter((p) => p.runs.length) };
}

/** The exit slide's own words around the button's name and the next lesson's. */
const OPEN_IN_YAWP = ': open it in Yawp!';
const NEXT_TIME = 'Next time: ';

/** A split slide's panel holds 380 pixels of headline. */
const PANEL_TEXT_WIDTH = 380;
const PANEL_HEADLINE_SIZES = [60, 58, 52, 50, 44, 38, 32, 28];

/**
 * The size, no larger than `size`, at which a headline's longest word fits on
 * one line of the panel. `perLetter` is a letter's width as a share of the
 * type size: about 0.6 for Fraunces Bold, 0.55 for Georgia.
 */
function fitLongestWord(text: string, size: number, perLetter: number): number {
  const longest = Math.max(...text.split(/\s+/).map((word) => word.length));
  return PANEL_HEADLINE_SIZES.find((candidate) => candidate <= size && longest * candidate * perLetter <= PANEL_TEXT_WIDTH) ?? PANEL_HEADLINE_SIZES.at(-1)!;
}

/** An excerpt slide's passage has a column 660 wide and, over its credit line, about 500 tall. */
const PASSAGE_WIDTH = 660;
const PASSAGE_HEIGHT = 500;
const PASSAGE_LEADING = 1.45;

/** A quiz choice's row is the slide's width less its letter. */
const CHOICE_WIDTH = 1060;
const CHOICE_LEADING = 1.35;

/**
 * The quiz's rows (bot test, Nov 19: a long choice ran under the next one).
 * Short choices are set as they always were, 28 point in rows of 64. A choice
 * that runs to another line gets a taller row, and when the rows together
 * would leave the slide, every choice steps down a size until they fit.
 */
function quizRows(choices: string[], room: number): { size: number; heights: number[]; height: number } {
  const at = (size: number) => {
    const heights = choices.map((choice) => {
      const lines = Math.max(1, Math.ceil((choice.length * size * 0.5) / CHOICE_WIDTH));
      return Math.round((size + 6) * CHOICE_LEADING + (lines - 1) * size * CHOICE_LEADING + 18);
    });
    return { size, heights, height: heights.reduce((sum, h) => sum + h, 0) };
  };
  const sizes = [28, 24, 22, 20, 18];
  return sizes.map(at).find((rows) => rows.height <= room) ?? at(18);
}

/**
 * The size a passage is set in: 30, or 26 for a long one, and then down until
 * it fits by its lines as well as its words. A poem is short in words and
 * long in lines (bot test, Nov 19: "Harlem" lost its first line off the top).
 */
function passageSize(passage: string): number {
  const start = passage.split(/\s+/).length > 70 ? 26 : 30;
  const fits = (size: number) => {
    const lines = passage.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil((line.length * size * 0.52) / PASSAGE_WIDTH)), 0);
    return lines * size * PASSAGE_LEADING <= PASSAGE_HEIGHT;
  };
  return [30, 26, 22, 20, 18].find((size) => size <= start && fits(size)) ?? 18;
}

// Marked phrases ----------------------------------------------------------

/**
 * Text as it is compared: lower case, curly quotes straight, any run of
 * spaces or line ends one space. `at` is where each letter came from.
 */
function comparable(text: string): { plain: string; at: number[] } {
  let plain = '';
  const at: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let letter = text[i]!;
    if (/\s/.test(letter)) {
      if (plain.endsWith(' ')) continue;
      letter = ' ';
    } else if ('‘’ʼ′`'.includes(letter)) letter = "'";
    else if ('“”″'.includes(letter)) letter = '"';
    else if (letter.toLowerCase().length === 1) letter = letter.toLowerCase();
    plain += letter;
    at.push(i);
  }
  return { plain, at };
}

export type KitV4Highlight = {
  /** Where the phrase is in the passage. */
  start: number;
  end: number;
  /** Which of the slide's phrases it is, from 0: its color, and its task's. */
  phrase: number;
};

/**
 * Where an excerpt slide's phrases are in its passage (Nov 22), in the order
 * they are read. A planner copies a phrase nearly as printed: the case, the
 * kind of quote mark and a line break inside it may differ, so those are not
 * held against it. Each phrase is marked once, where it first stands as whole
 * words; one that is not in the passage, or lies over one already marked, is
 * left out rather than guessed at.
 */
export function findHighlights(passage: string, phrases: string[]): KitV4Highlight[] {
  const { plain, at } = comparable(passage);
  const found: KitV4Highlight[] = [];
  const whole = (from: number, length: number) => !/[\p{L}\p{N}]/u.test(plain[from - 1] ?? ' ') && !/[\p{L}\p{N}]/u.test(plain[from + length] ?? ' ');
  phrases.slice(0, MAX_HIGHLIGHTS).forEach((phrase, index) => {
    const asked = comparable(phrase).plain.trim();
    // "the sleeping fog." where the passage has "the sleeping fog,".
    const bare = asked.replace(/^[\s.,;:!?"'…-]+|[\s.,;:!?"'…-]+$/g, '');
    for (const words of asked === bare ? [asked] : [asked, bare]) {
      if (words.length < 2) continue;
      let first = -1;
      let from = plain.indexOf(words);
      while (from >= 0 && !whole(from, words.length)) {
        if (first < 0) first = from;
        from = plain.indexOf(words, from + 1);
      }
      if (from < 0) from = first;
      if (from < 0) continue;
      const start = at[from]!;
      const end = at[from + words.length - 1]! + 1;
      if (!found.some((taken) => start < taken.end && taken.start < end)) found.push({ start, end, phrase: index });
      return;
    }
  });
  return found.sort((a, b) => a.start - b.start);
}

/**
 * A passage with its marked phrases, a paragraph to each line as printed. A
 * line of verse is its own paragraph because the PDF, writing one run after
 * another, starts the line after a line break inside a run where that run
 * began, not at the margin. A blank line (between stanzas) is a line's space
 * after the line before it. Georgia is never bold, so the marked words are
 * set in Arial Bold, as the author's name under the passage is, a little
 * smaller so its letters are as tall as Georgia's.
 */
function markedPassage(passage: string, marks: KitV4Highlight[], size: number, toneOf: (phrase: number) => string): KitV4Para[] {
  const paras: KitV4Para[] = [];
  let start = 0;
  for (const line of passage.split('\n')) {
    const end = start + line.length;
    if (!line.trim()) {
      const before = paras.at(-1);
      if (before) before.after = (before.after ?? 0) + size * PASSAGE_LEADING;
    } else {
      const runs: KitV4Run[] = [];
      let cursor = start;
      for (const mark of marks) {
        if (mark.end <= start || mark.start >= end) continue;
        const from = Math.max(mark.start, start);
        const to = Math.min(mark.end, end);
        runs.push(serif(passage.slice(cursor, from), size, KIT_V4.ink), sans(passage.slice(from, to), Math.round(size * 0.92), toneOf(mark.phrase), true));
        cursor = to;
      }
      runs.push(serif(passage.slice(cursor, end), size, KIT_V4.ink));
      paras.push(para(runs, 0, PASSAGE_LEADING));
    }
    start = end + 1;
  }
  const last = paras.at(-1);
  // The same space over the credit line as an unmarked passage has.
  if (last) last.after = 26;
  return paras;
}

function hueApart(a: string, b: string): number {
  const distance = Math.abs(hue(a).h - hue(b).h);
  return Math.min(distance, 360 - distance);
}

/**
 * A color at its brightest that still reads on cream at 4.5:1. A deck color
 * is darker than that (pine is nearly ink), and a marked phrase has to stand
 * apart from the ink around it and from the phrase marked beside it.
 */
function brightOnCream(hex: string): string {
  const value = normalizedHex(hex)!.slice(1);
  const channels = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  let out = normalizedHex(hex)!;
  for (let step = 1; step <= 60; step += 1) {
    const next = `#${channels.map((channel) => Math.min(255, Math.round(channel * (1 + step * 0.05))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    if (contrastRatio(next, KIT_V4.cream) < 4.5) break;
    out = next;
  }
  return out;
}

/**
 * A color for each marked phrase: the deck's own, in the order color marks
 * number them, then the house's, leaving out any that is near one already
 * there, so no phrase is taken for another. Each at its brightest that reads
 * on cream.
 */
export function kitV4HighlightColors(colors: string[]): string[] {
  // A deck's second color can be a second blue (the Great Wave's): told apart on a panel, not in two phrases.
  const tones = colors.filter((color, i) => colors.slice(0, i).every((earlier) => hueApart(earlier, color) >= 30));
  for (const house of KIT_V4_HOUSE_PALETTE.map(kitV4Readable)) {
    if (tones.length >= MAX_HIGHLIGHTS) break;
    if (tones.every((tone) => hueApart(tone, house) >= 30)) tones.push(house);
  }
  return tones.map(brightOnCream);
}

/**
 * A marked phrase's color for its task's dot on the panel. Every deck color
 * is dark enough to carry white type, so on a panel none of them shows as it
 * is: it is lightened until it does, and keeps its hue.
 */
export function kitV4OnPanel(tone: string, panel: string): string {
  const value = normalizedHex(tone)!.slice(1);
  const channels = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16));
  for (let step = 0; step <= 20; step += 1) {
    const out = `#${channels.map((channel) => Math.round(channel + (255 - channel) * (step / 20)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    if (contrastRatio(out, panel) >= 3) return out;
  }
  return KIT_V4.white;
}

// Diagrams ----------------------------------------------------------------

/** A letter's width as a share of its size: Arial, and Arial Bold. */
const LETTER = 0.5;
const BOLD_LETTER = 0.58;

/**
 * How many lines words take in a box. Like the quiz's rows and the passage,
 * a letter is taken as about half its size wide. Unlike them it breaks at
 * words: a diagram's boxes are narrow, and there a long word costs a line.
 */
function linesIn(text: string, size: number, width: number, perLetter = LETTER): number {
  const perLine = Math.max(1, Math.floor(width / (size * perLetter)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = used ? used + 1 + word.length : word.length;
    if (joined <= perLine) {
      used = joined;
      continue;
    }
    if (used) lines += 1;
    used = word.length;
    while (used > perLine) {
      lines += 1;
      used -= perLine;
    }
  }
  return lines;
}

/** The words cut to the lines there are, ending in an ellipsis; as they are when they fit. */
function clipToLines(text: string, size: number, width: number, lines: number, perLetter = LETTER): string {
  if (linesIn(text, size, width, perLetter) <= lines) return text;
  const words = text.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    words.pop();
    const cut = `${words.join(' ').replace(/[\s,;:.–—-]+$/, '')}…`;
    if (linesIn(cut, size, width, perLetter) <= lines) return cut;
  }
  const perLine = Math.max(2, Math.floor(width / (size * perLetter)));
  return `${text.slice(0, perLine * lines - 1)}…`;
}

const longestWordOf = (text: string) => Math.max(...text.split(/\s+/).map((word) => word.length));

/** One of a box's lines of words (a name, a sentence, a note), with the sizes it steps down through. */
type Piece = { text: string; sizes: number[]; bold?: boolean; leading: number; after: number };
type SetPiece = { text: string; size: number; whole: boolean };

const sizeAt = (piece: Piece, step: number) => piece.sizes[Math.min(step, piece.sizes.length - 1)]!;
const letterOf = (piece: Piece) => (piece.bold ? BOLD_LETTER : LETTER);

function piecesHeight(pieces: Piece[], width: number, step: number): number {
  const shown = pieces.filter((piece) => piece.text);
  return shown.reduce(
    (sum, piece, i) => sum + linesIn(piece.text, sizeAt(piece, step), width, letterOf(piece)) * sizeAt(piece, step) * piece.leading + (i < shown.length - 1 ? piece.after : 0),
    0
  );
}

/**
 * The first step down at which every box holds its words, with no word
 * broken across lines ("Counterargume / nt"): one size for all, so a row
 * reads as a row.
 */
function fitStep(boxes: Array<{ pieces: Piece[]; width: number; height: number }>): number {
  const steps = Math.max(1, ...boxes.flatMap((box) => box.pieces.map((piece) => piece.sizes.length)));
  const whole = (box: { pieces: Piece[]; width: number }, step: number) =>
    box.pieces.every((piece) => !piece.text || longestWordOf(piece.text) * sizeAt(piece, step) * letterOf(piece) <= box.width);
  for (let step = 0; step < steps; step += 1) {
    if (boxes.every((box) => whole(box, step) && piecesHeight(box.pieces, box.width, step) <= box.height)) return step;
  }
  return steps - 1;
}

/**
 * A box's words at a step. Words never run out of their box: what does not
 * fit at the smallest size is cut with an ellipsis, the first piece keeping
 * its line and a later one going when there is no line left for it.
 */
function setPieces(pieces: Piece[], width: number, height: number, step: number): SetPiece[] {
  let room = height;
  return pieces.map((piece, i) => {
    const size = sizeAt(piece, step);
    const line = size * piece.leading;
    if (!piece.text) return { text: '', size, whole: true };
    const later = pieces.slice(i + 1).filter((next) => next.text);
    const kept = later.reduce((sum, next) => sum + sizeAt(next, step) * next.leading, later.length ? piece.after : 0);
    let lines = Math.floor((room - kept + 0.5) / line);
    if (lines < 1) lines = i === 0 ? 1 : Math.floor((room + 0.5) / line);
    if (lines < 1) return { text: '', size, whole: false };
    const text = clipToLines(piece.text, size, width, lines, letterOf(piece));
    room -= linesIn(text, size, width, letterOf(piece)) * line + piece.after;
    return { text, size, whole: text === piece.text };
  });
}

/** A run of a diagram's words, typed on the slide where it shows all of its field. */
function diagramRun(run: KitV4Run, index: number, key: 'label' | 'text' | 'note', whole = true, lead = 0): KitV4Run {
  return whole ? from(run, on('diagram', { index, key, ...(lead ? { lead } : {}) })) : run;
}

/**
 * A diagram's boxes and words (Nov 22), between `top` and `bottom` of the
 * slide. The renderers draw filled boxes and words and nothing else, so each
 * kind is made of those: a strip of blocks, frames that are a colored box
 * with a cream one a little smaller over it, cards with a band.
 */
function diagramElements(slide: Slide, { colors, color, top, bottom }: { colors: string[]; color: string; top: number; bottom: number }): KitV4Element[] {
  const diagram = slide.diagram;
  if (!diagram) return [];
  const elements: KitV4Element[] = [];
  const items = diagram.items;
  const n = items.length;
  const left = MARGIN;
  const fullW = KIT_V4_WIDTH - MARGIN * 2;
  const room = bottom - top;
  const tone = (i: number) => colors[i % colors.length] ?? color;
  const block = (box: Box, fill: string) => elements.push({ kind: 'rect', role: 'block', fill, ...box });
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  /** A box's words as paragraphs: `look` gives each piece its color and the field it is typed back to. */
  const words = (item: number, set: SetPiece[], pieces: Piece[], look: Array<{ tone: string; key: 'label' | 'text' | 'note' } | null>) =>
    set.map((piece, i) => {
      const style = look[i];
      const run = sans(piece.text, piece.size, style?.tone ?? KIT_V4.ink, Boolean(pieces[i]!.bold));
      return para([style ? diagramRun(run, item, style.key, piece.whole) : run], pieces[i]!.after, pieces[i]!.leading);
    });

  if (diagram.kind === 'parts') {
    const GAP = 8;
    // A part with no size is a usual one.
    const given = items.flatMap((item) => (item.weight ? [item.weight] : []));
    const usual = given.length ? sum(given) / given.length : 1;
    const weights = items.map((item) => item.weight ?? usual);
    const usable = fullW - GAP * (n - 1);
    // No block thinner than its number.
    const THIN = 36;
    let widths = weights.map((weight) => (usable * weight) / sum(weights));
    const thin = widths.filter((width) => width < THIN).length;
    if (thin) {
      const rest = sum(widths.filter((width) => width >= THIN));
      widths = widths.map((width) => (width < THIN ? THIN : (width * (usable - thin * THIN)) / rest));
    }
    const xs = widths.map((_, i) => left + sum(widths.slice(0, i)) + GAP * i);

    // A block under 150 wide holds no sentence a class can read: the strip
    // shows the proportions, and the words go under it in a numbered list.
    if (widths.some((width) => width < 150)) {
      const stripH = 64;
      const cols = n <= 3 ? 1 : 2;
      const per = Math.ceil(n / cols);
      const COL_GAP = 48;
      const CHIP = 34;
      const colW = (fullW - COL_GAP * (cols - 1)) / cols;
      const textW = colW - CHIP - 16;
      const pieces = items.map((item): Piece[] => [
        { text: item.label, sizes: [26, 24, 22, 20, 18], bold: true, leading: 1.2, after: 4 },
        { text: item.text ?? '', sizes: [24, 22, 20, 18, 16], leading: 1.3, after: 4 },
        { text: item.note ?? '', sizes: [19, 18, 17, 16, 15], leading: 1.3, after: 0 },
      ]);
      const ROW_GAP = 18;
      const rowRoom = (room - stripH - 28 - ROW_GAP * (per - 1)) / per;
      const step = fitStep(pieces.map((list) => ({ pieces: list, width: textW, height: rowRoom })));
      const rowH = Math.min(rowRoom, Math.max(CHIP, ...pieces.map((list) => piecesHeight(list, textW, step))));
      const y = top + Math.max(0, Math.min(100, (room - stripH - 28 - per * rowH - ROW_GAP * (per - 1)) * 0.4));
      items.forEach((item, i) => {
        block({ x: xs[i]!, y, w: widths[i]!, h: stripH }, tone(i));
        const pad = widths[i]! >= 60 ? 14 : Math.max(4, (widths[i]! - 12) / 2);
        elements.push(column({ x: xs[i]! + pad, y, w: widths[i]! - pad - 2, h: stripH }, [para([sans(String(i + 1), 20, KIT_V4.white, true)])]));
        const rowX = left + Math.floor(i / per) * (colW + COL_GAP);
        const rowY = y + stripH + 28 + (i % per) * (rowH + ROW_GAP);
        block({ x: rowX, y: rowY, w: CHIP, h: CHIP }, tone(i));
        elements.push(column({ x: rowX + 12, y: rowY + 1, w: CHIP - 13, h: CHIP - 1 }, [para([sans(String(i + 1), 18, KIT_V4.white, true)])]));
        elements.push(
          column(
            { x: rowX + CHIP + 16, y: rowY, w: textW, h: rowH },
            words(i, setPieces(pieces[i]!, textW, rowH, step), pieces[i]!, [{ tone: tone(i), key: 'label' }, { tone: KIT_V4.ink, key: 'text' }, { tone: KIT_V4.grey, key: 'note' }]),
            'top'
          )
        );
      });
      return elements;
    }

    // Each part's name in its block, one size for all; where a name does not
    // fit its block even small, every name goes under the strip instead.
    const INSIDE = 14;
    const labelSize = [28, 24, 22, 20, 18].find((size) =>
      items.every((item, i) => linesIn(item.label, size, widths[i]! - INSIDE * 2, BOLD_LETTER) <= 2 && longestWordOf(item.label) * size * BOLD_LETTER <= widths[i]! - INSIDE * 2)
    );
    // Under the strip a name is as large as its longest word allows in its
    // block, whatever size the sentences under it need.
    const underLabel = [24, 22, 20, 18].find((size) => items.every((item, i) => longestWordOf(item.label) * size * BOLD_LETTER <= widths[i]!)) ?? 18;
    const pieces = items.map((item): Piece[] => [
      { text: labelSize ? '' : item.label, sizes: [24, 24, 22, 20, 18].map((size) => Math.min(size, underLabel)), bold: true, leading: 1.2, after: 6 },
      // A sentence is never much larger than the name over it.
      { text: item.text ?? '', sizes: [24, 22, 20, 18, 16].map((size) => (labelSize ? size : Math.min(size, underLabel + 2))), leading: 1.3, after: 8 },
      { text: item.note ?? '', sizes: [19, 18, 17, 16, 15], leading: 1.3, after: 0 },
    ]);
    const labelLines = labelSize ? Math.max(...items.map((item, i) => linesIn(item.label, labelSize, widths[i]! - INSIDE * 2, BOLD_LETTER))) : 1;
    const least = Math.round(labelLines * (labelSize ?? 26) * 1.15 + 44);
    const UNDER = 16;
    const wanted = Math.max(...pieces.map((list, i) => piecesHeight(list, widths[i]!, 0)));
    // The strip takes the room the words leave, up to a bar a class can see from the back.
    const stripH = Math.max(least, Math.min(150, room - UNDER - wanted - 40));
    const step = fitStep(pieces.map((list, i) => ({ pieces: list, width: widths[i]!, height: room - stripH - UNDER })));
    const under = Math.min(room - stripH - UNDER, Math.max(...pieces.map((list, i) => piecesHeight(list, widths[i]!, step))));
    const y = top + Math.max(0, Math.min(100, (room - stripH - UNDER - under) * 0.4));
    const underH = bottom - (y + stripH + UNDER);
    items.forEach((item, i) => {
      block({ x: xs[i]!, y, w: widths[i]!, h: stripH }, tone(i));
      elements.push(
        column({ x: xs[i]! + INSIDE, y, w: widths[i]! - INSIDE * 2, h: stripH }, [
          para([labelSize ? diagramRun(sans(item.label, labelSize, KIT_V4.white, true), i, 'label') : sans(String(i + 1), 26, KIT_V4.white, true)], 0, 1.15),
        ])
      );
      elements.push(
        column(
          { x: xs[i]!, y: y + stripH + UNDER, w: widths[i]!, h: underH },
          words(i, setPieces(pieces[i]!, widths[i]!, underH, step), pieces[i]!, [{ tone: tone(i), key: 'label' }, { tone: KIT_V4.ink, key: 'text' }, { tone: KIT_V4.grey, key: 'note' }]),
          'top'
        )
      );
    });
    return elements;
  }

  if (diagram.kind === 'frames') {
    // Four frames are as many as stay readable one inside the other; a fifth
    // and sixth are lines in the innermost.
    const drawn = items.slice(0, 4);
    const more = items.slice(4);
    const count = drawn.length;
    // Four frames have less room each: a little less air around their words.
    const snug = count === 4;
    const BORDER = 5;
    const PAD_X = 22;
    const PAD_TOP = snug ? 10 : 12;
    const PAD_BOTTOM = snug ? 12 : 14;
    const INSET = 34;
    const textW = (k: number) => fullW - 2 * k * INSET - 2 * (BORDER + PAD_X);
    const sizes =
      count <= 2
        ? { label: [30, 26, 24, 22, 20], text: [26, 24, 22, 20, 18], note: [20, 18, 17, 16, 15] }
        : count === 3
          ? { label: [26, 24, 22, 20, 18], text: [24, 22, 20, 18, 16], note: [18, 17, 16, 15, 15] }
          : { label: [24, 22, 20, 18, 18], text: [22, 20, 18, 16, 15], note: [17, 16, 15, 15, 15] };
    const moreLines = (k: number): Piece[] => (k === count - 1 ? more.map((item) => ({ text: item.text ? `${item.label}: ${item.text}` : item.label, sizes: sizes.text, leading: 1.3, after: 4 })) : []);
    // Stacked: the name, then its sentence, then its note. In a line: all three run on, to save height.
    const stacked = (k: number): Piece[] => [
      { text: drawn[k]!.label, sizes: sizes.label, bold: true, leading: 1.2, after: 4 },
      { text: drawn[k]!.text ?? '', sizes: sizes.text, leading: 1.3, after: 4 },
      { text: drawn[k]!.note ?? '', sizes: sizes.note, leading: 1.3, after: more.length && k === count - 1 ? 8 : 0 },
      ...moreLines(k),
    ];
    const pick = (list: number[], step: number) => list[Math.min(step, list.length - 1)]!;
    const inLine = (k: number, step: number) => {
      const item = drawn[k]!;
      const run = (text: string | undefined, size: number, letter: number) => (text ? (text.length + 3) * size * letter : 0);
      // A little over, for the ends of lines a word did not reach.
      const long = (run(item.label, pick(sizes.label, step), BOLD_LETTER) + run(item.text, pick(sizes.text, step), LETTER) + run(item.note, pick(sizes.note, step), LETTER)) * 1.04;
      const extra = moreLines(k);
      return Math.max(1, Math.ceil(long / textW(k))) * pick(sizes.label, step) * 1.3 + (extra.length ? 8 + piecesHeight(extra, textW(k), step) : 0);
    };
    const GAP = snug ? 8 : 12;
    const INSET_BOTTOM = snug ? 12 : 16;
    const fixed = count * (BORDER + PAD_TOP) + (count - 1) * (GAP + INSET_BOTTOM) + PAD_BOTTOM + BORDER;
    const tries = [0, 1, 2, 3, 4].flatMap((step) => [
      { step, line: false },
      { step, line: true },
    ]);
    const heads = (step: number, line: boolean) => drawn.map((_, k) => (line ? inLine(k, step) : piecesHeight(stacked(k), textW(k), step)));
    const chosen = tries.find(({ step, line }) => fixed + sum(heads(step, line)) <= room);
    // Nothing fits: every frame keeps its name and one line of its sentence.
    const tight = !chosen;
    const { step, line } = chosen ?? { step: 4, line: true };
    const size = { label: pick(sizes.label, step), text: pick(sizes.text, step), note: pick(sizes.note, step) };
    const headH = tight ? drawn.map(() => size.label * 1.3) : heads(step, line);
    const slack = Math.max(0, room - fixed - sum(headH));
    // Room to spare opens the frames up a little, then lets the innermost breathe; the rest stays under the diagram.
    const open = count > 1 ? Math.min(34, (slack * 0.35) / (count - 1)) : 0;
    const inner = Math.min(110, slack - 2 * open * (count - 1));
    const height = fixed + sum(headH) + 2 * open * (count - 1) + inner;
    let y = top + Math.max(0, Math.min(100, (room - height) * 0.4));
    let foot = y + height;
    drawn.forEach((item, k) => {
      const x = left + k * INSET;
      const w = fullW - 2 * k * INSET;
      block({ x, y, w, h: foot - y }, tone(k));
      block({ x: x + BORDER, y: y + BORDER, w: w - BORDER * 2, h: foot - y - BORDER * 2 }, KIT_V4.cream);
      const last = k === count - 1;
      const box = { x: x + BORDER + PAD_X, y: y + BORDER + PAD_TOP, w: textW(k), h: last ? foot - BORDER - PAD_BOTTOM - (y + BORDER + PAD_TOP) : headH[k]! + GAP + open - 2 };
      if (line || tight) {
        // On one line the sentence is cut to what is left beside the name.
        const beside = box.w - (item.label.length + 3) * size.label * BOLD_LETTER;
        const sentence = item.text ? (tight ? clipToLines(item.text, size.text, Math.max(size.text * 4, beside), 1) : item.text) : '';
        const extra = tight ? [] : moreLines(k);
        elements.push(
          column(
            box,
            [
              para(
                [
                  diagramRun(sans(item.label, size.label, tone(k), true), k, 'label'),
                  sentence ? diagramRun(sans(`   ${sentence}`, size.text, KIT_V4.ink), k, 'text', sentence === item.text, 3) : null,
                  item.note && !tight ? diagramRun(sans(`   ${item.note}`, size.note, KIT_V4.grey), k, 'note', true, 3) : null,
                ],
                extra.length ? 8 : 0,
                1.3
              ),
              ...extra.map((piece) => para([sans(piece.text, sizeAt(piece, step), KIT_V4.ink)], piece.after, piece.leading)),
            ],
            'top'
          )
        );
      } else {
        const pieces = stacked(k);
        elements.push(column(box, words(k, setPieces(pieces, box.w, box.h, step), pieces, [{ tone: tone(k), key: 'label' }, { tone: KIT_V4.ink, key: 'text' }, { tone: KIT_V4.grey, key: 'note' }]), 'top'));
      }
      y += BORDER + PAD_TOP + headH[k]! + GAP + open;
      foot -= INSET_BOTTOM + open;
    });
    return elements;
  }

  // A cast: cards in a grid, one row up to three, then two.
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = n <= 3 ? 1 : 2;
  const GAP = 24;
  const PAD = 20;
  const cardW = (fullW - GAP * (cols - 1)) / cols;
  const innerW = cardW - PAD * 2;
  const sizes =
    n === 2
      ? { label: [36, 32, 28, 24, 22], text: [30, 28, 26, 24, 22, 20], note: [22, 22, 20, 18, 17, 16] }
      : n <= 4
        ? { label: [32, 28, 26, 24, 22], text: [28, 26, 24, 22, 20, 18], note: [21, 20, 19, 18, 17, 16] }
        : { label: [26, 24, 22, 20, 18], text: [22, 21, 20, 19, 18, 17, 16], note: [18, 17, 17, 16, 16, 15, 15] };
  // One size for every name, at which each fits its band in two lines or fewer.
  const labelSize = sizes.label.find((size) => items.every((item) => linesIn(item.label, size, innerW, BOLD_LETTER) <= 2 && longestWordOf(item.label) * size * BOLD_LETTER <= innerW)) ?? sizes.label.at(-1)!;
  const names = items.map((item) => clipToLines(item.label, labelSize, innerW, 2, BOLD_LETTER));
  const bandH = Math.round(Math.max(...names.map((name) => linesIn(name, labelSize, innerW, BOLD_LETTER))) * labelSize * 1.15 + 26);
  const most = (room - GAP * (rows - 1)) / rows;
  const BAND_GAP = 16;
  const FOOT = 18;
  const pieces = items.map((item): Piece[] => [
    { text: item.text ?? '', sizes: sizes.text, leading: 1.3, after: 10 },
    { text: item.note ?? '', sizes: sizes.note, leading: 1.3, after: 0 },
  ]);
  const step = fitStep(pieces.map((list) => ({ pieces: list, width: innerW, height: most - bandH - BAND_GAP - FOOT })));
  const wanted = Math.max(...pieces.map((list) => piecesHeight(list, innerW, step)));
  // A card is as tall as its words, and never so short it stops being a card.
  const cardH = Math.min(most, Math.max(bandH + BAND_GAP + wanted + FOOT + 8, rows === 1 ? 260 : 190));
  const y0 = top + Math.max(0, Math.min(100, (room - rows * cardH - GAP * (rows - 1)) * 0.4));
  items.forEach((item, i) => {
    const x = left + (i % cols) * (cardW + GAP);
    const y = y0 + Math.floor(i / cols) * (cardH + GAP);
    block({ x, y, w: cardW, h: cardH }, KIT_V4.white);
    block({ x, y, w: cardW, h: bandH }, color);
    elements.push(column({ x: x + PAD, y: y + 2, w: innerW, h: bandH - 2 }, [para([diagramRun(sans(names[i]!, labelSize, KIT_V4.white, true), i, 'label', names[i] === item.label)], 0, 1.15)]));
    const bodyH = cardH - bandH - BAND_GAP - FOOT;
    elements.push(
      column(
        { x: x + PAD, y: y + bandH + BAND_GAP, w: innerW, h: bodyH },
        words(i, setPieces(pieces[i]!, innerW, bodyH, step), pieces[i]!, [{ tone: KIT_V4.ink, key: 'text' }, { tone: KIT_V4.grey, key: 'note' }]),
        'top'
      )
    );
  });
  return elements;
}

/** Label on cream: Arial bold 24 in the deck color. On a panel: gold. */
const labelRun = (label: string | null, color: string) => (label ? sans(label, 24, color, true) : null);

/**
 * One slide as boxes, in kit pixels. Every renderer draws this, so Present,
 * PowerPoint and the PDF hang the same slide.
 */
export function layoutKitV4Slide(deck: SlideDeck, index: number): KitV4SlideLayout {
  const plans = planKitV4Deck(deck);
  const plan = plans[index]!;
  const colors = kitV4Colors(deck);
  const art = resolveDeckArt(deck.art);
  const { slide } = plan;
  const elements: KitV4Element[] = [];
  const color = plan.color;
  const W = KIT_V4_WIDTH;
  const H = KIT_V4_HEIGHT;
  const v41 = isKitV41(deck);
  // Spec v4 leaves room for the running head; v4.1 has none, so a column is
  // centered on the slide.
  const TOP = v41 ? 80 : 96;
  const COLUMN_H = v41 ? H - 160 : H - 96 - 64;
  const fullColumn: Box = { x: MARGIN, y: TOP, w: W - MARGIN * 2, h: COLUMN_H };
  const out = (template = plan.template) => ({ template, background: KIT_V4.cream, elements });
  /** A title, headline or prompt: Fraunces Bold over 40px in spec v4.1, else Georgia. */
  const head = (text: string, size: number, tone: string): KitV4Run => (v41 && size > 40 ? display(text, size, tone) : serif(text, size, tone));
  const promptSize = (text: string) => (v41 ? kitV41PromptSize(text) : kitV4PromptSize(text));
  /** Spec v4.1 has no running head: the lesson's name is on the title slide only. */
  const pushRunningHead = (x: number, right?: number) => {
    if (!v41) elements.push(runningHead(deck, x, right));
  };
  /** 84px for a short title; a long one, or one long word, at 66 (v4.1: 66–84). */
  const titleSize41 = (text: string) => {
    const longestWord = Math.max(...text.split(/\s+/).map((word) => word.length));
    return text.length > 20 || longestWord > 11 ? 66 : 84;
  };

  // A split slide: the panel, its words, and the cream column beside it.
  const split = (panelParas: KitV4Para[], creamParas: KitV4Para[]) => {
    const left = plan.panel!.side === 'left';
    const width = left ? PANEL_WIDTH : EXCERPT_PANEL_WIDTH;
    const panelX = left ? 0 : W - width;
    elements.push({ kind: 'rect', role: 'panel', fill: plan.panel!.color, x: panelX, y: 0, w: width, h: H });
    elements.push(column({ x: panelX + (left ? MARGIN : 60), y: TOP, w: width - MARGIN - (left ? 60 : 60), h: COLUMN_H }, panelParas));
    const creamX = left ? width + MARGIN : MARGIN;
    const creamRight = left ? W - MARGIN : W - width - 60;
    pushRunningHead(creamX, creamRight);
    elements.push(column({ x: creamX, y: TOP, w: creamRight - creamX, h: COLUMN_H }, creamParas));
  };
  // A label the teacher can retype is the slide's mode. A quiz's count, the
  // exit's "Before you go" and a divider's step are the layout's own.
  const labelEditable =
    Boolean(plan.label) && !plan.quiz && plan.template !== 'exit' && !(plan.template === 'divider' && (slide.processStep || slide.part));
  const label = (tone: string) => {
    const run = labelRun(plan.label, tone);
    return labelEditable ? from(run, on('mode', { commit: 'blur' })) : run;
  };
  const panelLabel = label(KIT_V4.gold);
  /** The words students answer, and the field they are read from. */
  const askFrom = slide.question != null ? 'question' : slide.body != null ? 'body' : 'title';
  const tasksFrom = (i: number, key: 'verb' | 'text') =>
    slide.tasks?.length ? on('tasks', key === 'verb' ? { index: i, key, trail: 1 } : { index: i, key }) : on('bullets', { index: i });
  // Fraunces Bold sets wider than Georgia, so v4.1 steps down sooner.
  // And then down until its longest word fits on a line of the panel (bot
  // test, Nov 19: "Foreshadowing hunt" was drawn as "Foreshadowin").
  const panelHeadline = (text: string) =>
    v41
      ? display(text, fitLongestWord(text, text.length <= 18 ? 58 : text.length <= 40 ? 50 : 44, 0.6), KIT_V4.white)
      : serif(text, fitLongestWord(text, text.length <= 22 ? 60 : 52, 0.55), KIT_V4.white);
  const mark = (text: string, make: (text: string, color: string) => KitV4Run, source?: KitV4Source, base: string = KIT_V4.ink) =>
    marked(text, colors, make, base, source);

  switch (plan.template) {
    case 'title': {
      // The lesson's own picture hangs where the painting would, and wins over
      // it (Nov 22): a photograph of the book's world says more than a
      // painting chosen for its mood. Its credit is drawn with the picture.
      const pictured = Boolean(slide.image);
      if (v41) {
        const right = art || pictured ? 640 : W - MARGIN;
        // Never "Yawp! Writing Program": the class and date, or nothing.
        const course = slide.course && !/yawp!?\s+writing\s+program/i.test(slide.course) ? slide.course : null;
        if (deck.unit) {
          elements.push({ kind: 'text', role: 'body', valign: 'top', x: MARGIN, y: 64, w: right - MARGIN, h: 30, paras: [para([from(sans(deck.unit, 20, KIT_V4.grey), { on: 'deck', field: 'unit' })])] });
        }
        elements.push(
          column({ x: MARGIN, y: 130, w: right - MARGIN, h: 440 }, [
            para([from(display(slide.title, titleSize41(slide.title), KIT_V4.ink), on('title'))], 20, 1.05),
            para([slide.subtitle ? from(serif(slide.subtitle, 34, color), on('subtitle')) : null], 0, 1.3),
          ])
        );
        // The teacher's name, when the planner has it; then the class and date.
        const who = [
          slide.teacher ? from(sans(slide.teacher, 19, KIT_V4.grey), on('teacher')) : null,
          course ? from(sans(course, 19, KIT_V4.grey), on('course')) : null,
        ].filter((run): run is KitV4Run => Boolean(run));
        if (who.length) {
          elements.push(column({ x: MARGIN, y: 590, w: right - MARGIN, h: 70 }, who.map((run) => para([run], 4)), 'top'));
        }
        if (pictured) {
          elements.push({ kind: 'picture', id: slide.image!, x: 680, y: 140, w: 520, h: 400 });
        } else if (art) {
          elements.push({ kind: 'art', src: art.src, fit: 'contain', alt: `${art.title}, ${art.artist}`, x: 680, y: 140, w: 520, h: 400 });
          elements.push(credit(art, { x: 680, y: 556, w: 520, h: 60 }));
        }
        return out();
      }
      const right = art || pictured ? 640 : W - MARGIN;
      // 92px for a short title; a long one, or one long word, at 80.
      const longestWord = Math.max(...slide.title.split(/\s+/).map((word) => word.length));
      const titleSize = slide.title.length > 24 || longestWord > 9 ? 80 : 92;
      elements.push(
        column({ x: MARGIN, y: 80, w: right - MARGIN, h: H - 160 }, [
          para([deck.unit ? from(sans(deck.unit, 24, color, true), { on: 'deck', field: 'unit' }) : null], 28),
          para([from(serif(slide.title, titleSize, KIT_V4.ink), on('title'))], 20, 1.0),
          para([slide.subtitle ? from(serif(slide.subtitle, 40, color), on('subtitle')) : null], 32),
          para([slide.course ? from(sans(slide.course, 20, KIT_V4.grey), on('course')) : null]),
        ])
      );
      if (pictured) {
        elements.push({ kind: 'picture', id: slide.image!, x: 680, y: 110, w: 520, h: 430 });
      } else if (art) {
        elements.push({ kind: 'art', src: art.src, fit: 'contain', alt: `${art.title}, ${art.artist}`, x: 680, y: 110, w: 520, h: 430 });
        elements.push(credit(art, { x: 680, y: 556, w: 520, h: 60 }));
      }
      return out();
    }

    case 'agenda': {
      const items = slide.agenda ?? (slide.bullets ?? []).map((title) => ({ title, minutes: undefined as number | undefined }));
      pushRunningHead(MARGIN);
      elements.push(
        column({ x: MARGIN, y: TOP, w: 360, h: H - 160 }, [
          para([head('Today', v41 ? 74 : 72, KIT_V4.ink)], 16, 1.0),
          para([
            slide.body ?? slide.subtitle
              ? from(sans((slide.body ?? slide.subtitle)!, 22, v41 ? KIT_V4.grey : KIT_V4.body), on(slide.body != null ? 'body' : 'subtitle'))
              : null,
          ]),
        ])
      );
      elements.push(
        column(
          { x: 520, y: TOP, w: W - MARGIN - 520, h: H - 160 },
          items.map((item, i) =>
            para(
              [
                serif(String(i + 1), v41 ? 38 : 40, color),
                // Spec v4.1 sets what students read as an idea in Georgia.
                from(
                  v41 ? serif(`   ${item.title}`, 32, KIT_V4.ink) : sans(`   ${item.title}`, 28, KIT_V4.ink),
                  slide.agenda ? on('agenda', { index: i, key: 'title', lead: 3 }) : on('bullets', { index: i, lead: 3 })
                ),
                item.minutes ? sans(`   ${minutesLine(item.minutes)}`, 20, KIT_V4.grey) : null,
              ],
              22
            )
          )
        )
      );
      return out();
    }

    case 'steps': {
      const steps = (slide.bullets ?? []).slice(0, 4);
      split(
        [para([panelLabel], 18), para([from(panelHeadline(slide.title), on('title'))], 18, 1.05), para([slide.minutes ? sans(minutesLine(slide.minutes), 22, KIT_V4.sand) : null])],
        steps.map((text, i) => para([serif(String(i + 1), 40, color), sans('   ', 26, KIT_V4.ink), ...mark(text, (t, c) => sans(t, 26, c), on('bullets', { index: i }))], 26, 1.3))
      );
      return out();
    }

    case 'discuss': {
      const question = slide.question ?? slide.body ?? slide.title;
      const grouping = [slide.grouping, slide.minutes && !slide.grouping?.includes('min') ? minutesLine(slide.minutes) : null].filter(Boolean).join(', ');
      // The grouping is the slide's; a minutes line joined to it is the layout's.
      const groupingRun = grouping
        ? slide.grouping
          ? from(sans(grouping, 22, KIT_V4.sand), on('grouping', { trail: grouping.length - slide.grouping.length }))
          : sans(grouping, 22, KIT_V4.sand)
        : null;
      const asked = [
        para(mark(question, (t, c) => head(t, Math.min(promptSize(question), 54), c), on(askFrom)), 30, 1.15),
        para([slide.stem ? from(serif(slide.stem, 30, color), on('stem')) : null], 20, 1.25),
        para([slide.followUp ? from(sans(slide.followUp, 22, KIT_V4.body), on('followUp')) : null]),
      ];
      if (slide.image) {
        // Dual coding (preview, Nov 22: "What do you know about the Dust
        // Bowl?" beside a dust storm): the picture on the panel under the
        // slide's name, the question beside it.
        const left = plan.panel!.side === 'left';
        const panelX = left ? 0 : W - PANEL_WIDTH;
        elements.push({ kind: 'rect', role: 'panel', fill: plan.panel!.color, x: panelX, y: 0, w: PANEL_WIDTH, h: H });
        elements.push(
          column({ x: panelX + 60, y: 48, w: PANEL_WIDTH - 120, h: 214 }, [para([panelLabel], 10), para([from(panelHeadline(slide.title), on('title'))], 10, 1.05), para([groupingRun])], 'top')
        );
        elements.push({ kind: 'picture', id: slide.image, x: panelX + 60, y: 280, w: PANEL_WIDTH - 120, h: 380 });
        const creamX = left ? PANEL_WIDTH + MARGIN : MARGIN;
        const creamRight = left ? W - MARGIN : W - PANEL_WIDTH - 60;
        pushRunningHead(creamX, creamRight);
        elements.push(column({ x: creamX, y: TOP, w: creamRight - creamX, h: COLUMN_H }, asked));
        return out();
      }
      split([para([panelLabel], 18), para([from(panelHeadline(slide.title), on('title'))], 18, 1.05), para([groupingRun])], asked);
      return out();
    }

    case 'notes': {
      const timeline = (slide.timeline ?? []).slice(0, 5);
      const facts = (slide.facts ?? (timeline.length ? [] : slide.bullets ?? [])).slice(0, 3);
      const notesCream = [
          ...timeline.map((entry, i) =>
            para(
              [
                from(serif(entry.year, 36, color), on('timeline', { index: i, key: 'year' })),
                from(sans(`   ${entry.caption}`, 24, KIT_V4.ink), on('timeline', { index: i, key: 'caption', lead: 3 })),
              ],
              14,
              1.25
            )
          ),
          ...facts.map((fact, i) =>
            para(mark(fact, (t, c) => sans(t, 26, c), on(slide.facts ? 'facts' : 'bullets', { index: i })), i === facts.length - 1 ? 0 : 20, 1.35)
          ),
      ];
      if (slide.image) {
        // Dual coding (Nov 22): the picture of the thing on the panel under its
        // name, the facts beside it.
        const left = plan.panel!.side === 'left';
        const panelX = left ? 0 : W - PANEL_WIDTH;
        elements.push({ kind: 'rect', role: 'panel', fill: plan.panel!.color, x: panelX, y: 0, w: PANEL_WIDTH, h: H });
        elements.push(column({ x: panelX + 60, y: 48, w: PANEL_WIDTH - 120, h: 196 }, [para([panelLabel], 10), para([from(panelHeadline(slide.title), on('title'))], 0, 1.05)], 'top'));
        elements.push({ kind: 'picture', id: slide.image, x: panelX + 60, y: 262, w: PANEL_WIDTH - 120, h: 398 });
        const creamX = left ? PANEL_WIDTH + MARGIN : MARGIN;
        const creamRight = left ? W - MARGIN : W - PANEL_WIDTH - 60;
        pushRunningHead(creamX, creamRight);
        elements.push(column({ x: creamX, y: TOP, w: creamRight - creamX, h: COLUMN_H }, notesCream));
        return out();
      }
      split([para([panelLabel], 18), para([from(panelHeadline(slide.title), on('title'))], 0, 1.05)], notesCream);
      return out();
    }

    case 'read': {
      const tasks = slide.tasks?.length ? slide.tasks.slice(0, 3) : (slide.bullets ?? []).slice(0, 3).map((text) => ({ verb: '', text }));
      const instruction = slide.subtitle ?? slide.body;
      const source = slide.work ? `${slide.work}${slide.page ? `, ${slide.page}` : ''}` : null;
      split(
        [
          para([panelLabel], 18),
          para([from(panelHeadline(slide.title), on('title'))], 18, 1.05),
          para([instruction ? from(sans(instruction, 22, KIT_V4.sand), on(slide.subtitle != null ? 'subtitle' : 'body')) : null], 10),
          para([source && slide.work ? from(sans(source, 20, KIT_V4.sand), on('work', { trail: source.length - slide.work.length })) : null]),
        ],
        tasks.map((task, i) =>
          para(
            [
              task.verb ? from(sans(`${task.verb} `, 26, color, true), tasksFrom(i, 'verb')) : null,
              ...mark(task.text, (t, c) => sans(t, 26, c), tasksFrom(i, 'text')),
            ],
            26,
            1.3
          )
        )
      );
      return out();
    }

    case 'excerpt': {
      const tasks = slide.tasks?.length ? slide.tasks.slice(0, 3) : (slide.bullets ?? []).slice(0, 3).map((text) => ({ verb: '', text }));
      const passage = slide.body ?? '';
      const who = slide.author ?? slide.attribution;
      const page = slide.page?.replace(/^p+\.\s*/i, '');
      // The phrases the tasks point at (Nov 22), each in a color, and that
      // color's dot before its task: students see where to look for what.
      const marks = slide.highlight?.length ? findHighlights(passage, slide.highlight) : [];
      const tones = kitV4HighlightColors(colors);
      const toneOf = (phrase: number) => tones[phrase % tones.length]!;
      const size = passageSize(passage);
      // Marked, the passage is several runs, and typing into one of them could
      // not be written back as the whole passage: it is changed in the editor's field.
      const passageParas = marks.length
        ? markedPassage(passage, marks, size, toneOf)
        : [para([from(serif(passage, size, KIT_V4.ink), on('body'))], 26, PASSAGE_LEADING)];
      // A task's verb takes its phrase's color ("Underline" in the color of
      // what is underlined); a task with no verb gets a dot of that color. A
      // third run in a wrapped line overlapped the next task in the PDF
      // (preview, Nov 22), so the dot is only for a task with no verb.
      const toneOnPanel = (i: number) => (marks.some((mark) => mark.phrase === i) ? kitV4OnPanel(toneOf(i), plan.panel!.color) : null);
      const dot = (i: number) => (toneOnPanel(i) && !tasks[i]?.verb ? sans('● ', 24, toneOnPanel(i)!) : null);
      split(
        [
          para([panelLabel], 22),
          ...tasks.map((task, i) =>
            para(
              [
                dot(i),
                task.verb ? from(sans(`${task.verb} `, 24, toneOnPanel(i) ?? KIT_V4.white, true), tasksFrom(i, 'verb')) : null,
                from(sans(task.text, 24, KIT_V4.white), tasksFrom(i, 'text')),
              ],
              18,
              1.3
            )
          ),
        ],
        [
          ...passageParas,
          para([
            who ? from(sans(who, 18, KIT_V4.ink, true), on(slide.author != null ? 'author' : 'attribution')) : null,
            slide.work ? from(sans(`${who ? ', ' : ''}${slide.work}`, 18, KIT_V4.grey), on('work', { lead: who ? 2 : 0 })) : null,
            // "p. 4" is drawn as ", p. 4": only a bare page is typed on the slide.
            slide.page
              ? page === slide.page
                ? from(sans(`, p. ${page}`, 18, KIT_V4.grey), on('page', { lead: 5 }))
                : sans(`, p. ${page}`, 18, KIT_V4.grey)
              : null,
          ]),
        ]
      );
      return out();
    }

    case 'big_idea': {
      const statement = slide.body ?? slide.title;
      // Dual coding (Nov 22): its own picture beside the statement, in place of the painting's strip.
      const pictured = Boolean(slide.image);
      const left = pictured ? 600 : art ? 410 : MARGIN;
      if (pictured) elements.push({ kind: 'picture', id: slide.image!, x: 60, y: 80, w: 480, h: 560 });
      else if (art) elements.push({ kind: 'art', src: art.crops.strip, fit: 'cover', alt: '', x: 0, y: 0, w: 330, h: H });
      pushRunningHead(left);
      elements.push(
        column({ x: left, y: 96, w: W - MARGIN - left, h: H - 96 - 96 }, [
          para([label(color)], 22),
          para(mark(statement, (t, c) => head(t, pictured ? Math.min(promptSize(statement), 44) : promptSize(statement), c), on(slide.body != null ? 'body' : 'title')), 26, 1.12),
          para([slide.followUp ? from(serif(slide.followUp, 30, color), on('followUp')) : null], 0, 1.25),
        ])
      );
      if (art && !pictured) elements.push(credit(art, { x: left, y: H - 56, w: W - MARGIN - left, h: 30 }));
      return out();
    }

    case 'write': {
      const prompt = slide.body ?? slide.question ?? slide.title;
      const minutes = slide.seconds ? Math.max(1, Math.round(slide.seconds / 60)) : slide.minutes;
      const right = minutes ? 900 : W - MARGIN;
      pushRunningHead(MARGIN, 900);
      if (plan.label) {
        elements.push({ kind: 'text', role: 'body', valign: 'top', align: 'right', x: 940, y: RUNNING_HEAD_TOP - 4, w: W - MARGIN - 940, h: 34, paras: [para([label(color)])] });
      }
      elements.push(
        column({ x: MARGIN, y: 110, w: right - MARGIN - 40, h: H - 110 - 80 }, [
          para(
            mark(prompt, (t, c) => head(t, promptSize(prompt), c), on(slide.body != null ? 'body' : slide.question != null ? 'question' : 'title')),
            28,
            1.12
          ),
          para([slide.routine ? from(sans(withoutDots(slide.routine), 22, color), on('routine')) : null], 12),
          para(
            [slide.stem ?? slide.followUp ? from(serif((slide.stem ?? slide.followUp)!, 28, KIT_V4.body), on(slide.stem != null ? 'stem' : 'followUp')) : null],
            0,
            1.25
          ),
        ])
      );
      if (minutes) {
        elements.push({
          kind: 'text',
          role: 'timer',
          valign: 'bottom',
          align: 'right',
          x: 900,
          y: 180,
          w: W - MARGIN - 900,
          h: 440,
          paras: [para([v41 ? display(String(minutes), 200, color) : serif(String(minutes), 220, color)], 4, 0.9), para([sans(minutes === 1 ? 'minute' : 'minutes', 20, KIT_V4.grey)])],
        });
      }
      return out();
    }

    case 'divider': {
      const right = art ? 600 : W - MARGIN;
      elements.push(
        column({ x: MARGIN, y: 80, w: right - MARGIN, h: H - 160 }, [
          para([label(color)], 22),
          para([from(v41 ? display(slide.title, titleSize41(slide.title), KIT_V4.ink) : serif(slide.title, 80, KIT_V4.ink), on('title'))], 22, v41 ? 1.05 : 1.0),
          // Like the title (v4.1): the detail line in Georgia, in the deck color.
          para(
            [slide.subtitle ? from(v41 ? serif(slide.subtitle, 34, color) : sans(slide.subtitle, 22, KIT_V4.body), on('subtitle')) : null],
            0,
            v41 ? 1.3 : undefined
          ),
        ])
      );
      if (art) {
        elements.push({ kind: 'art', src: art.src, fit: 'contain', alt: `${art.title}, ${art.artist}`, x: 680, y: 110, w: 520, h: 430 });
        elements.push(credit(art, { x: 680, y: 556, w: 520, h: 60 }));
      }
      return out();
    }

    case 'look':
    case 'picture': {
      const isPicture = plan.template === 'picture';
      const question = isPicture ? pictureSlideText(slide) : slide.question ?? slide.body ?? slide.title;
      // A look slide studies its own picture when it has one (preview, Nov 22:
      // "What do you see?" asked of a Lange photograph that was not drawn).
      const own = Boolean(slide.image);
      const large = own || (!isPicture && Boolean(art));
      const seconds = slide.seconds ? `${slide.seconds} seconds` : null;
      const routine = slide.routine ? withoutDots(slide.routine) : null;
      if (large) {
        // Spec v4.1: a picture students study is about 1000px wide or more.
        // It hangs from the slide's top left corner, as in the kit.
        const box = v41 ? { x: 0, y: 0, w: 1000, h: 668 } : { x: 40, y: 40, w: 900, h: 600 };
        const creditBox = v41 ? { x: 24, y: 678, w: 976, h: 30 } : { x: 40, y: 652, w: 900, h: 30 };
        if (own) elements.push({ kind: 'picture', id: slide.image!, ...box });
        else elements.push({ kind: 'art', src: art!.src, fit: 'contain', alt: `${art!.title}, ${art!.artist}`, ...box });
        if (!own) elements.push(credit(art!, creditBox));
        else if (slide.attribution) elements.push({ kind: 'text', role: 'credit', valign: 'top', ...creditBox, paras: [para([from(sans(slide.attribution, 15, KIT_V4.grey), on('attribution'))])] });
      }
      const x = large ? (v41 ? 1032 : 976) : MARGIN;
      const lookSize = v41 ? 28 : 34;
      elements.push(
        column({ x, y: 60, w: W - (large ? (v41 ? 32 : 64) : MARGIN) - x, h: H - 120 }, [
          para([label(color)], 16),
          para([isPicture ? from(sans(slide.title, 20, KIT_V4.grey), on('title')) : seconds ? sans(seconds, 20, KIT_V4.grey) : null], 4),
          para([!isPicture && routine ? from(sans(routine, 20, KIT_V4.grey), on('routine')) : null], 16),
          para(question ? mark(question, (t, c) => head(t, large ? lookSize : promptSize(question), c), on(askFrom)) : [], 20, 1.2),
          para([slide.followUp ? from(serif(slide.followUp, large ? (v41 ? 24 : 26) : 32, color), on('followUp')) : null], 0, 1.25),
        ])
      );
      return out();
    }

    case 'quiz': {
      const question = slide.question ?? slide.body ?? slide.title;
      const choices = (slide.choices ?? []).slice(0, 5);
      const size = Math.min(promptSize(question), 54);
      const questionH = size >= 54 ? 150 : 120;
      const rows = quizRows(choices, (v41 ? 624 : 584) - 34 - questionH - 24);
      const total = 34 + questionH + 24 + rows.height;
      const top = v41 ? Math.max(48, (H - total) / 2) : Math.max(96, (H - total) / 2 + 16);
      pushRunningHead(MARGIN);
      elements.push(column({ x: MARGIN, y: top, w: W - MARGIN * 2, h: 34 + questionH }, [para([label(color)], 14), para(mark(question, (t, c) => head(t, size, c), on(askFrom)), 0, 1.12)], 'bottom'));
      const reveal = plan.quiz?.reveal && slide.answer ? slide.answer : null;
      let y = top + 34 + questionH + 24;
      choices.forEach((choice, i) => {
        const rowH = rows.heights[i]!;
        const right = reveal === i + 1;
        const greyed = reveal !== null && !right;
        if (right) elements.push({ kind: 'rect', role: 'band', fill: kitV4Band(color), x: MARGIN - 20, y, w: W - MARGIN * 2 + 40, h: rowH });
        elements.push(
          column({ x: MARGIN, y, w: W - MARGIN * 2, h: rowH }, [
            para([serif('abcde'[i]!, rows.size + 6, greyed ? KIT_V4.grey : color), sans('   ', rows.size, KIT_V4.ink), ...mark(choice, (t, c) => sans(t, rows.size, greyed ? KIT_V4.grey : c), on('choices', { index: i }))]),
          ])
        );
        y += rowH;
      });
      return out();
    }

    case 'exit': {
      const statement = slide.body ?? slide.title;
      const right = art ? 820 : W - MARGIN;
      pushRunningHead(MARGIN);
      elements.push(
        column({ x: MARGIN, y: TOP, w: right - MARGIN, h: COLUMN_H }, [
          para([label(color)], 22),
          para(mark(statement, (t, c) => head(t, Math.min(promptSize(statement), 54), c), on(slide.body != null ? 'body' : 'title')), 22, 1.15),
          para([slide.followUp ? from(serif(slide.followUp, 28, KIT_V4.body), on('followUp')) : null], 22, 1.25),
          para([slide.button ? from(sans(`${slide.button}${OPEN_IN_YAWP}`, 24, color, true), on('button', { trail: OPEN_IN_YAWP.length })) : null], 18),
          para([slide.nextLesson ? from(sans(`${NEXT_TIME}${slide.nextLesson}`, 20, KIT_V4.grey), on('nextLesson', { lead: NEXT_TIME.length })) : null]),
        ])
      );
      if (art) {
        elements.push({ kind: 'art', src: art.src, fit: 'contain', alt: '', x: 880, y: 200, w: 320, h: 250 });
        elements.push(credit(art, { x: 880, y: 466, w: 320, h: 60 }));
      }
      return out();
    }

    case 'define': {
      // Words for a text's background (Kevin, Nov 21), set like a dictionary:
      // the word in the deck color, then what it means and an example.
      const terms = (slide.terms ?? []).slice(0, 3);
      elements.push(column({ x: MARGIN, y: 48, w: W - MARGIN * 2, h: 92 }, [para([from(head(slide.title, slide.title.length > 34 ? 40 : 48, KIT_V4.ink), on('title'))], 0, 1.05)], 'bottom'));
      const TOP_ROW = 176;
      const rowH = (H - TOP_ROW - 56) / Math.max(1, terms.length);
      const WORD_W = 360;
      const wordBase = terms.length === 1 ? 64 : terms.length === 2 ? 50 : 42;
      const meaningSize = terms.length === 1 ? 34 : terms.length === 2 ? 28 : 24;
      const exampleSize = terms.length === 1 ? 24 : 20;
      terms.forEach((term, i) => {
        const y = TOP_ROW + i * rowH;
        if (i) elements.push({ kind: 'rect', role: 'mark', fill: KIT_V4_DIM, x: MARGIN, y: y - 14, w: W - MARGIN * 2, h: 2 });
        const longest = Math.max(...term.word.split(/\s+/).map((word) => word.length));
        const wordSize = Math.max(26, Math.min(wordBase, Math.floor(WORD_W / (longest * 0.62))));
        elements.push(column({ x: MARGIN, y, w: WORD_W, h: rowH - 28 }, [para([from(display(term.word, wordSize, color), on('terms', { index: i, key: 'word' }))], 0, 1.05)], 'top'));
        elements.push(
          column({ x: MARGIN + WORD_W + 40, y: y + 4, w: W - MARGIN * 2 - WORD_W - 40, h: rowH - 28 }, [
            para([from(serif(term.definition, meaningSize, KIT_V4.ink), on('terms', { index: i, key: 'definition' }))], 10, 1.3),
            para([term.example ? from(sans(term.example, exampleSize, KIT_V4.grey), on('terms', { index: i, key: 'example' })) : null], 0, 1.35),
          ], 'top')
        );
      });
      return out();
    }

    case 'person': {
      // Who someone is (Kevin, Nov 21): real people and a novel's characters,
      // each with the teacher's picture where there is one.
      const people = (slide.people ?? []).slice(0, 4);
      const pictured = people.some((person) => person.image);
      elements.push(column({ x: MARGIN, y: 48, w: W - MARGIN * 2, h: 92 }, [para([from(head(slide.title, slide.title.length > 34 ? 40 : 48, KIT_V4.ink), on('title'))], 0, 1.05)], 'bottom'));
      const TOP_ROW = 176;
      const areaW = W - MARGIN * 2;
      const areaH = H - TOP_ROW - 56;
      // The headline already names a person shown alone: no second line saying it again.
      const named = (person: (typeof people)[number]) => people.length === 1 && person.name.trim().toLowerCase() === slide.title.trim().toLowerCase();
      const words = (person: (typeof people)[number], i: number, nameSize: number, textSize: number) => [
        para([named(person) ? null : from(display(person.name, nameSize, KIT_V4.ink), on('people', { index: i, key: 'name' }))], 8, 1.1),
        para([from(sans(person.role, Math.max(18, Math.round(textSize * 0.85)), color, true), on('people', { index: i, key: 'role' }))], 14, 1.2),
        para([person.note ? from(serif(person.note, textSize, KIT_V4.ink), on('people', { index: i, key: 'note' })) : null], 0, 1.3),
      ];
      const fit = (name: string, size: number, width: number) => {
        const longest = Math.max(...name.split(/\s+/).map((word) => word.length));
        return Math.max(22, Math.min(size, Math.floor(width / (longest * 0.62))));
      };
      if (people.length === 1) {
        const person = people[0]!;
        const pictureW = person.image ? 480 : 0;
        if (person.image) elements.push({ kind: 'picture', id: person.image, x: MARGIN, y: TOP_ROW, w: pictureW, h: areaH });
        const x = MARGIN + (person.image ? pictureW + 48 : 0);
        const width = Math.min(W - MARGIN - x, person.image ? W : 900);
        elements.push(column({ x, y: TOP_ROW, w: width, h: areaH }, words(person, 0, fit(person.name, 60, width), person.image ? 28 : 34), 'middle'));
        return out();
      }
      const GAP = 40;
      const cardW = (areaW - GAP * (people.length - 1)) / people.length;
      const pictureH = pictured ? (people.length === 2 ? 280 : 230) : 0;
      // Without pictures the words carry the slide: larger, and in the middle of it.
      const nameSize = pictured ? (people.length === 2 ? 36 : 28) : people.length === 2 ? 48 : people.length === 3 ? 40 : 34;
      const textSize = pictured ? (people.length === 2 ? 22 : 19) : people.length === 2 ? 28 : 24;
      people.forEach((person, i) => {
        const x = MARGIN + i * (cardW + GAP);
        if (person.image) elements.push({ kind: 'picture', id: person.image, x, y: TOP_ROW, w: cardW, h: pictureH });
        // Every card starts at the same line, so the names read across.
        const y = TOP_ROW + (pictured ? pictureH + 20 : 56);
        elements.push(column({ x, y, w: cardW, h: TOP_ROW + areaH - y }, words(person, i, fit(person.name, nameSize, cardW), textSize), 'top'));
      });
      return out();
    }

    case 'timeline': {
      const events = (slide.events ?? []).slice(0, 8);
      const focus = slide.focus !== undefined && events[slide.focus] ? slide.focus : undefined;
      const inFocus = focus === undefined ? undefined : events[focus]!;
      // Two rows when the slide names them: the world above the line, the book below.
      const twoRows = Boolean(slide.tracks) && events.some((event) => event.track === 2);
      const side = (event: (typeof events)[number], i: number) => (twoRows ? (event.track === 2 ? 'below' : 'above') : i % 2 ? 'below' : 'above');
      // The event in focus shows its own picture, top right (dual coding, Nov 22).
      const shot = inFocus?.image;
      const beside = shot ? 370 : 0;
      elements.push(column({ x: MARGIN, y: 48, w: W - MARGIN * 2 - beside, h: 92 }, [para([from(head(slide.title, slide.title.length > 34 ? 40 : 48, KIT_V4.ink), on('title'))], 0, 1.05)], 'bottom'));
      if (shot) elements.push({ kind: 'picture', id: shot, x: W - MARGIN - 340, y: 36, w: 340, h: 236 });
      // Under the headline: the event in focus, in a sentence; with none, the slide's own line.
      if (inFocus) {
        const words = inFocus.detail ?? inFocus.title;
        elements.push(
          column(
            { x: MARGIN, y: 152, w: W - MARGIN * 2 - Math.max(120, beside), h: 108 },
            [para([from(serif(words, words.length > 150 ? 24 : 28, KIT_V4.ink), on('events', { index: focus!, key: inFocus.detail ? 'detail' : 'title' }))], 0, 1.3)],
            'top'
          )
        );
      } else if (slide.body) {
        elements.push(column({ x: MARGIN, y: 152, w: W - MARGIN * 2 - 120, h: 108 }, [para([from(sans(slide.body, 22, v41 ? KIT_V4.grey : KIT_V4.body), on('body'))], 0, 1.3)], 'top'));
      }
      const AXIS = 456;
      // With two rows, their names sit at the line's left end.
      const start = MARGIN + (twoRows ? 170 : 0);
      const step = (W - MARGIN - start) / (events.length + 1);
      elements.push({ kind: 'rect', role: 'mark', fill: color, x: MARGIN, y: AXIS, w: W - MARGIN * 2, h: 6 });
      if (twoRows && slide.tracks) {
        slide.tracks.forEach((name, row) => {
          elements.push({
            kind: 'text',
            role: 'body',
            valign: row ? 'top' : 'bottom',
            x: MARGIN,
            y: row ? AXIS + 26 : AXIS - 20 - 60,
            w: 150,
            h: 60,
            paras: [para([from(sans(name, 17, KIT_V4.grey, true), on('tracks', { index: row }))], 0, 1.2)],
          });
        });
      }
      events.forEach((event, i) => {
        const where = side(event, i);
        // Its words run as far as the next event on its own side of the line.
        let next = events.length + 1;
        for (let j = i + 1; j < events.length; j += 1) {
          if (side(events[j]!, j) === where) {
            next = j;
            break;
          }
        }
        const x = start + i * step;
        const dim = focus !== undefined && focus !== i;
        const boxW = Math.min(400, (next - i) * step - 24);
        // A full line leaves each event a narrow box: its words step down until
        // the longest one fits, never broken mid-word ("Auschwit / z", Nov 20).
        const fits = (text: string, size: number, least: number) => {
          const longest = Math.max(...text.split(/\s+/).map((word) => word.length));
          return Math.max(least, Math.min(size, Math.floor(boxW / (longest * 0.62))));
        };
        elements.push({ kind: 'rect', role: 'mark', step: i, fill: dim ? KIT_V4_DIM : focus === i ? KIT_V4.ink : color, x, y: AXIS - 6, w: 18, h: 18 });
        elements.push({
          ...column(
            { x, y: where === 'above' ? AXIS - 22 - 160 : AXIS + 30, w: boxW, h: 160 },
            [
              para([from(serif(event.date, fits(event.date, 30, 20), dim ? KIT_V4_DIM : color), on('events', { index: i, key: 'date' }))], 4, 1.1),
              para([from(sans(event.title, fits(event.title, 20, 14), dim ? KIT_V4_DIM : KIT_V4.ink, true), on('events', { index: i, key: 'title' }))], 6, 1.25),
              // Few events and none in focus: each one's sentence fits beside it.
              para([focus === undefined && events.length <= 4 && event.detail ? from(sans(event.detail, fits(event.detail, 16, 12), KIT_V4.grey), on('events', { index: i, key: 'detail' })) : null], 0, 1.3),
            ],
            where === 'above' ? 'bottom' : 'top'
          ),
          step: i,
        });
      });
      return out();
    }

    case 'map': {
      const places = (slide.places ?? []).slice(0, 8);
      const focus = slide.focus !== undefined && places[slide.focus] ? slide.focus : undefined;
      const located = places.filter((place) => place.lat !== undefined && place.lon !== undefined);
      // The view Yawp! wrote with the places' positions; without one, a frame around the places it has.
      const view = slide.view ?? fitMapView(located.map((place) => pointArea(place.lon!, place.lat!)));
      const nameOf = (place: (typeof places)[number]) => place.label ?? place.name;
      if (view) {
        const spec: MapSpec = {
          view,
          shade: slide.shade ?? [],
          color,
          route: slide.route ? located.map((place) => [place.lon!, place.lat!] as [number, number]) : [],
        };
        elements.push({ kind: 'map', x: 0, y: 0, w: MAP_BOX.w, h: MAP_BOX.h, src: mapImageSrc(spec), alt: `Map: ${places.map(nameOf).join(', ')}`, spec });
        const plates: Box[] = [];
        // Every pin first, so a name can keep clear of the others (Venice's pin
        // sat on Verona's name, demo pass Nov 21).
        const pinBoxes = places.map((place, i) => {
          if (place.lat === undefined || place.lon === undefined || !inMapView(view, place.lon, place.lat)) return null;
          const point = mapPoint(view, place.lon, place.lat);
          const size = focus === i ? 30 : 24;
          return { x: point.x * MAP_BOX.w - size / 2, y: point.y * MAP_BOX.h - size / 2, w: size, h: size };
        });
        const clashes = (box: Box, own: number) =>
          plates.some((taken) => box.x < taken.x + taken.w && taken.x < box.x + box.w && box.y < taken.y + taken.h && taken.y < box.y + box.h) ||
          pinBoxes.some((pin, j) => pin !== null && j !== own && box.x < pin.x + pin.w && pin.x < box.x + box.w && box.y < pin.y + pin.h && pin.y < box.y + box.h);
        places.forEach((place, i) => {
          if (place.lat === undefined || place.lon === undefined || !inMapView(view, place.lon, place.lat)) return;
          const point = mapPoint(view, place.lon, place.lat);
          const px = point.x * MAP_BOX.w;
          const py = point.y * MAP_BOX.h;
          const dim = focus !== undefined && focus !== i;
          // A pin carries its place's number, the one beside its name in the list, so towns close together can be told apart.
          const size = focus === i ? 30 : 24;
          elements.push({ kind: 'rect', role: 'mark', step: i, fill: dim ? KIT_V4_DIM : focus === i ? KIT_V4.ink : color, x: px - size / 2, y: py - size / 2, w: size, h: size });
          elements.push({ kind: 'text', role: 'body', valign: 'middle', x: px - 4.5, y: py - size / 2, w: 14, h: size, paras: [para([sans(String(i + 1), 15, KIT_V4.white, true)])] });
          // Its name on a cream plate beside the pin: to the left near the map's right edge, and below a name already there.
          const name = nameOf(place);
          const w = Math.min(280, name.length * 10.5 + 20);
          const inside = (box: Box) => box.x >= 4 && box.x + box.w <= MAP_BOX.w - 4 && box.y >= 4 && box.y + box.h <= MAP_BOX.h - 4;
          const right = px + 22;
          const left = px - 22 - w;
          // Beside the pin, then the other side, then above or below it, then further down.
          const candidates: Box[] = [
            { x: right, y: py - 15, w, h: 30 },
            { x: left, y: py - 15, w, h: 30 },
            { x: right, y: py + 16, w, h: 30 },
            { x: right, y: py - 46, w, h: 30 },
            { x: left, y: py + 16, w, h: 30 },
            { x: left, y: py - 46, w, h: 30 },
            { x: px - w / 2, y: py + 18, w, h: 30 },
            { x: px - w / 2, y: py - 48, w, h: 30 },
          ];
          let chosen = candidates.find((box) => inside(box) && !clashes(box, i));
          if (!chosen) {
            const x = px + 22 + w <= MAP_BOX.w - 8 ? right : left;
            let y = Math.max(6, Math.min(MAP_BOX.h - 36, py - 15));
            for (let tries = 0; tries < 6 && clashes({ x, y, w, h: 30 }, i); tries += 1) y += 34;
            chosen = { x, y, w, h: 30 };
          }
          const { x, y } = chosen;
          plates.push({ x, y, w, h: 30 });
          elements.push({ kind: 'rect', role: 'plate', step: i, fill: KIT_V4.cream, x, y, w, h: 30 });
          elements.push({
            kind: 'text',
            role: 'body',
            step: i,
            valign: 'middle',
            x: x + 10,
            y,
            w: w - 14,
            h: 30,
            paras: [para([from(sans(name, 17, dim ? KIT_V4.grey : KIT_V4.ink, true), on('places', { index: i, key: place.label ? 'label' : 'name' }))])],
          });
        });
      }
      const x = view ? MAP_BOX.w + 44 : MARGIN;
      const inFocus = focus === undefined ? undefined : places[focus]!;
      elements.push(
        column(
          { x, y: 56, w: W - 44 - x, h: 590 },
          [
            para([from(head(slide.title, slide.title.length > 22 ? 36 : 44, KIT_V4.ink), on('title'))], 14, 1.08),
            // What the shaded countries are, in the color they are shaded in.
            para([slide.shadeLabel ? from(sans(slide.shadeLabel, 18, color, true), on('shadeLabel')) : null], 16, 1.25),
            para([focus === undefined && slide.body ? from(sans(slide.body, 20, v41 ? KIT_V4.grey : KIT_V4.body), on('body')) : null], 18, 1.3),
            // The place in focus, in a sentence.
            para([inFocus?.note ? from(serif(inFocus.note, 24, KIT_V4.ink), on('places', { index: focus!, key: 'note' })) : null], 22, 1.3),
            ...places.flatMap((place, i) => {
              const dim = focus !== undefined && focus !== i;
              const offMap = place.lat === undefined || place.lon === undefined;
              return [
                para(
                  [
                    serif(String(i + 1), 24, dim ? KIT_V4_DIM : color),
                    // In the list a place goes by the same name as on the map.
                    sans(`   ${nameOf(place)}`, 20, dim ? KIT_V4_DIM : KIT_V4.ink, focus === i),
                    offMap ? sans('   not on the map', 15, KIT_V4.grey) : null,
                  ],
                  focus === undefined && places.length <= 3 && place.note ? 4 : 10,
                  1.25
                ),
                // Few places and none in focus: each one's sentence fits under it.
                para([focus === undefined && places.length <= 3 && place.note ? from(sans(place.note, 16, KIT_V4.grey), on('places', { index: i, key: 'note' })) : null], 12, 1.3),
              ];
            }),
          ],
          'top'
        )
      );
      if (view) {
        elements.push({
          kind: 'text',
          role: 'credit',
          valign: 'bottom',
          x,
          y: 656,
          w: W - 44 - x,
          h: 40,
          paras: [para([sans('Map: Natural Earth. Places: GeoNames. Borders are today’s.', 13, KIT_V4.grey)])],
        });
      }
      return out();
    }

    case 'diagram': {
      // How a text is built (Nov 22): its name at the top as on a compare
      // slide, one line under it, and the diagram in the room that is left.
      pushRunningHead(MARGIN);
      const width = W - MARGIN * 2;
      // One line at 48 or 44, two at 42 (all three Fraunces in spec v4.1), and a very long one smaller.
      const titleLetter = v41 ? 0.6 : 0.55;
      const titleSize = [48, 44].find((size) => linesIn(slide.title, size, width, titleLetter) === 1) ?? (linesIn(slide.title, 42, width, titleLetter) <= 2 ? 42 : 34);
      const headTop = v41 ? 56 : 88;
      const titleH = linesIn(slide.title, titleSize, width, titleSize > 40 ? titleLetter : 0.55) * titleSize * 1.08;
      const line = slide.body ? clipToLines(slide.body, 22, width, 2) : '';
      const lineH = line ? 12 + linesIn(line, 22, width) * 22 * 1.3 : 0;
      elements.push(
        column(
          { x: MARGIN, y: headTop, w: width, h: Math.ceil(titleH + lineH + 10) },
          [
            para([from(head(slide.title, titleSize, KIT_V4.ink), on('title'))], line ? 12 : 0, 1.08),
            para([line ? (line === slide.body ? from(sans(line, 22, v41 ? KIT_V4.grey : KIT_V4.body), on('body')) : sans(line, 22, v41 ? KIT_V4.grey : KIT_V4.body)) : null], 0, 1.3),
          ],
          'top'
        )
      );
      elements.push(...diagramElements(slide, { colors, color, top: Math.round(headTop + titleH + lineH + 32), bottom: H - 52 }));
      return out();
    }

    case 'compare': {
      pushRunningHead(MARGIN);
      elements.push(column({ x: MARGIN, y: 96, w: W - MARGIN * 2, h: 130 }, [para([from(head(slide.title, 52, KIT_V4.ink), on('title'))], 0, 1.05)], 'bottom'));
      [slide.left, slide.right].forEach((side, i) => {
        if (!side) return;
        elements.push(
          column(
            { x: MARGIN + i * 580, y: 260, w: 520, h: H - 260 - 80 },
            [
              para([from(sans(side.label, 24, colors[i] ?? color, true), on(i ? 'right' : 'left', { key: 'label' }))], 14),
              para(mark(side.text, (t, c) => sans(t, 26, c), on(i ? 'right' : 'left', { key: 'text' })), 0, 1.4),
            ],
            'top'
          )
        );
      });
      return out();
    }
  }
  elements.push(column(fullColumn, [para([from(head(slide.title, 52, KIT_V4.ink), on('title'))])]));
  return out();
}

/**
 * The deck, marked to be drawn in spec v4 where the school's flag is on, and
 * in spec v4.1 where that flag is on as well (v4.1 needs v4).
 */
export function withDeckKit<T extends SlideDeck>(deck: T, flags: { deckKitV4: boolean; deckKitV41?: boolean }): T {
  if (!flags.deckKitV4) return deck;
  return { ...deck, kit: flags.deckKitV41 ? 'v4.1' : 'v4' };
}

/** Drawn by this layout: spec v4 or spec v4.1. */
export function isKitV4(deck: Pick<SlideDeck, 'kit'>): boolean {
  return deck.kit === 'v4' || deck.kit === 'v4.1';
}

/** Spec v4.1 (Nov 11): Fraunces headlines, no running head, the new title slide. */
export function isKitV41(deck: Pick<SlideDeck, 'kit'>): boolean {
  return deck.kit === 'v4.1';
}
