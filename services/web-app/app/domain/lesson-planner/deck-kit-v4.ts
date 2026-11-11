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
 */
import type { Slide, SlideDeck } from './slide-deck';
import { resolveDeckArt, type DeckArt } from './deck-art';
import { contrastRatio, normalizedHex, splitColorMarks } from './deck-colors';
import { galleryTemplate, withoutLessonNumber, type GalleryTemplate } from './deck-gallery';
import { pictureSlideText } from './deck-pictures';

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

export type KitV4Template = GalleryTemplate | 'quiz';

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
};

/** Labels that only decorate. */
const DECORATIVE = new Set(['think', 'begin', 'also', 'next', 'now', 'here']);

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
  if (['steps', 'notes', 'read', 'divider', 'compare', 'title', 'discuss'].includes(template)) return slide.title;
  return slide.question ?? slide.body ?? slide.title;
}

function repeatsHeadline(label: string, template: KitV4Template, slide: Slide): boolean {
  const said = new Set(wordsOf(headlineOf(template, slide)));
  if (/before you go/i.test(label)) return /before you go/i.test(headlineOf(template, slide));
  const words = wordsOf(label).filter((word) => !['this', 'you', 'go', 'before'].includes(word));
  return words.length > 0 && words.every((word) => said.has(word) || said.has(`${word}s`) || said.has(word.replace(/e$/, 'ing')));
}

function labelFor(template: KitV4Template, slide: Slide, previous: string | null): string | null {
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
  // A label the deck did not ask for is skipped where the headline says it.
  if (!own && repeatsHeadline(label, template, slide)) return null;
  // The task did not change.
  if (label === previous) return null;
  return label;
}

function templateOf(slide: Slide): KitV4Template {
  if (slide.choices?.length) return 'quiz';
  return galleryTemplate(slide);
}

/** Every slide's template, label, panel, color and quiz place, in spec v4. */
export function planKitV4Deck(deck: SlideDeck): KitV4Plan[] {
  const colors = kitV4Colors(deck);
  const templates = deck.slides.map(templateOf);

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
      label: quiz ? `Question ${quiz.n} of ${quiz.of}` : labelFor(template, slide, previous),
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

// The layout --------------------------------------------------------------

export type KitV4Run = {
  text: string;
  face: 'serif' | 'sans';
  /** Kit pixels at 1280 wide. */
  size: number;
  color: string;
  /** Arial only: Georgia is never bold. */
  bold?: boolean;
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
  | (Box & { kind: 'rect'; fill: string; role: 'panel' | 'band' })
  | (Box & {
      kind: 'text';
      paras: KitV4Para[];
      valign: 'top' | 'middle' | 'bottom';
      align?: 'left' | 'right';
      role?: 'running-head' | 'credit' | 'timer' | 'body';
    })
  | (Box & { kind: 'art'; src: string; fit: 'contain' | 'cover'; alt: string })
  | (Box & { kind: 'picture'; id: string });

export type KitV4SlideLayout = {
  template: KitV4Template;
  background: string;
  elements: KitV4Element[];
};

const serif = (text: string, size: number, color: string): KitV4Run => ({ text, face: 'serif', size, color });
const sans = (text: string, size: number, color: string, bold = false): KitV4Run =>
  bold ? { text, face: 'sans', size, color, bold: true } : { text, face: 'sans', size, color };

/** A line students read with its color marks: the parts of a thesis, each in its color. */
function marked(text: string, colors: string[], make: (text: string, color: string) => KitV4Run, color: string): KitV4Run[] {
  return splitColorMarks(text, colors)
    .filter((part) => part.text)
    .map((part) => make(part.text, part.color ?? color));
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

function column(box: Box, paras: KitV4Para[], valign: 'top' | 'middle' | 'bottom' = 'middle'): KitV4Element {
  return { kind: 'text', role: 'body', valign, ...box, paras: paras.filter((p) => p.runs.length) };
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
  const fullColumn: Box = { x: MARGIN, y: 96, w: W - MARGIN * 2, h: H - 96 - 64 };
  const out = (template = plan.template) => ({ template, background: KIT_V4.cream, elements });

  // A split slide: the panel, its words, and the cream column beside it.
  const split = (panelParas: KitV4Para[], creamParas: KitV4Para[]) => {
    const left = plan.panel!.side === 'left';
    const width = left ? PANEL_WIDTH : EXCERPT_PANEL_WIDTH;
    const panelX = left ? 0 : W - width;
    elements.push({ kind: 'rect', role: 'panel', fill: plan.panel!.color, x: panelX, y: 0, w: width, h: H });
    elements.push(column({ x: panelX + (left ? MARGIN : 60), y: 96, w: width - MARGIN - (left ? 60 : 60), h: H - 96 - 64 }, panelParas));
    const creamX = left ? width + MARGIN : MARGIN;
    const creamRight = left ? W - MARGIN : W - width - 60;
    elements.push(runningHead(deck, creamX, creamRight));
    elements.push(column({ x: creamX, y: 96, w: creamRight - creamX, h: H - 96 - 64 }, creamParas));
  };
  const panelLabel = labelRun(plan.label, KIT_V4.gold);
  const panelHeadline = (text: string) => serif(text, text.length <= 22 ? 60 : 52, KIT_V4.white);
  const mark = (text: string, make: (text: string, color: string) => KitV4Run, base: string = KIT_V4.ink) => marked(text, colors, make, base);

  switch (plan.template) {
    case 'title': {
      const right = art ? 640 : W - MARGIN;
      // 92px for a short title; a long one, or one long word, at 80.
      const longestWord = Math.max(...slide.title.split(/\s+/).map((word) => word.length));
      const titleSize = slide.title.length > 24 || longestWord > 9 ? 80 : 92;
      elements.push(
        column({ x: MARGIN, y: 80, w: right - MARGIN, h: H - 160 }, [
          para([deck.unit ? sans(deck.unit, 24, color, true) : null], 28),
          para([serif(slide.title, titleSize, KIT_V4.ink)], 20, 1.0),
          para([slide.subtitle ? serif(slide.subtitle, 40, color) : null], 32),
          para([slide.course ? sans(slide.course, 20, KIT_V4.grey) : null]),
        ])
      );
      if (art) {
        elements.push({ kind: 'art', src: art.src, fit: 'contain', alt: `${art.title}, ${art.artist}`, x: 680, y: 110, w: 520, h: 430 });
        elements.push(credit(art, { x: 680, y: 556, w: 520, h: 60 }));
      }
      return out();
    }

    case 'agenda': {
      const items = slide.agenda ?? (slide.bullets ?? []).map((title) => ({ title, minutes: undefined as number | undefined }));
      elements.push(runningHead(deck, MARGIN));
      elements.push(
        column({ x: MARGIN, y: 96, w: 360, h: H - 160 }, [
          para([serif('Today', 72, KIT_V4.ink)], 16, 1.0),
          para([slide.body ?? slide.subtitle ? sans((slide.body ?? slide.subtitle)!, 22, KIT_V4.body) : null]),
        ])
      );
      elements.push(
        column(
          { x: 520, y: 96, w: W - MARGIN - 520, h: H - 160 },
          items.map((item, i) =>
            para([serif(String(i + 1), 40, color), sans(`   ${item.title}`, 28, KIT_V4.ink), item.minutes ? sans(`   ${minutesLine(item.minutes)}`, 20, KIT_V4.grey) : null], 22)
          )
        )
      );
      return out();
    }

    case 'steps': {
      const steps = (slide.bullets ?? []).slice(0, 4);
      split(
        [para([panelLabel], 18), para([panelHeadline(slide.title)], 18, 1.05), para([slide.minutes ? sans(minutesLine(slide.minutes), 22, KIT_V4.sand) : null])],
        steps.map((text, i) => para([serif(String(i + 1), 40, color), sans('   ', 26, KIT_V4.ink), ...mark(text, (t, c) => sans(t, 26, c))], 26, 1.3))
      );
      return out();
    }

    case 'discuss': {
      const question = slide.question ?? slide.body ?? slide.title;
      const grouping = [slide.grouping, slide.minutes && !slide.grouping?.includes('min') ? minutesLine(slide.minutes) : null].filter(Boolean).join(', ');
      split(
        [para([panelLabel], 18), para([panelHeadline(slide.title)], 18, 1.05), para([grouping ? sans(grouping, 22, KIT_V4.sand) : null])],
        [
          para(mark(question, (t, c) => serif(t, Math.min(kitV4PromptSize(question), 54), c)), 30, 1.15),
          para([slide.stem ? serif(slide.stem, 30, color) : null], 20, 1.25),
          para([slide.followUp ? sans(slide.followUp, 22, KIT_V4.body) : null]),
        ]
      );
      return out();
    }

    case 'notes': {
      const timeline = (slide.timeline ?? []).slice(0, 5);
      const facts = (slide.facts ?? (timeline.length ? [] : slide.bullets ?? [])).slice(0, 3);
      split(
        [para([panelLabel], 18), para([panelHeadline(slide.title)], 0, 1.05)],
        [
          ...timeline.map((entry) => para([serif(entry.year, 36, color), sans(`   ${entry.caption}`, 24, KIT_V4.ink)], 14, 1.25)),
          ...facts.map((fact, i) => para(mark(fact, (t, c) => sans(t, 26, c)), i === facts.length - 1 ? 0 : 20, 1.35)),
        ]
      );
      return out();
    }

    case 'read': {
      const tasks = slide.tasks?.length ? slide.tasks.slice(0, 3) : (slide.bullets ?? []).slice(0, 3).map((text) => ({ verb: '', text }));
      const instruction = slide.subtitle ?? slide.body;
      const source = slide.work ? `${slide.work}${slide.page ? `, ${slide.page}` : ''}` : null;
      split(
        [
          para([panelLabel], 18),
          para([panelHeadline(slide.title)], 18, 1.05),
          para([instruction ? sans(instruction, 22, KIT_V4.sand) : null], 10),
          para([source ? sans(source, 20, KIT_V4.sand) : null]),
        ],
        tasks.map((task) => para([task.verb ? sans(`${task.verb} `, 26, color, true) : null, ...mark(task.text, (t, c) => sans(t, 26, c))], 26, 1.3))
      );
      return out();
    }

    case 'excerpt': {
      const tasks = slide.tasks?.length ? slide.tasks.slice(0, 3) : (slide.bullets ?? []).slice(0, 3).map((text) => ({ verb: '', text }));
      const passage = slide.body ?? '';
      const who = slide.author ?? slide.attribution;
      split(
        [para([panelLabel], 22), ...tasks.map((task) => para([task.verb ? sans(`${task.verb} `, 24, KIT_V4.white, true) : null, sans(task.text, 24, KIT_V4.white)], 18, 1.3))],
        [
          para([serif(passage, passage.split(/\s+/).length > 70 ? 26 : 30, KIT_V4.ink)], 26, 1.45),
          para([
            who ? sans(who, 18, KIT_V4.ink, true) : null,
            slide.work ? sans(`${who ? ', ' : ''}${slide.work}`, 18, KIT_V4.grey) : null,
            slide.page ? sans(`, p. ${slide.page.replace(/^p+\.\s*/i, '')}`, 18, KIT_V4.grey) : null,
          ]),
        ]
      );
      return out();
    }

    case 'big_idea': {
      const statement = slide.body ?? slide.title;
      const left = art ? 410 : MARGIN;
      if (art) elements.push({ kind: 'art', src: art.crops.strip, fit: 'cover', alt: '', x: 0, y: 0, w: 330, h: H });
      elements.push(runningHead(deck, left));
      elements.push(
        column({ x: left, y: 96, w: W - MARGIN - left, h: H - 96 - 96 }, [
          para([labelRun(plan.label, color)], 22),
          para(mark(statement, (t, c) => serif(t, kitV4PromptSize(statement), c)), 26, 1.12),
          para([slide.followUp ? serif(slide.followUp, 30, color) : null], 0, 1.25),
        ])
      );
      if (art) elements.push(credit(art, { x: left, y: H - 56, w: W - MARGIN - left, h: 30 }));
      return out();
    }

    case 'write': {
      const prompt = slide.body ?? slide.question ?? slide.title;
      const minutes = slide.seconds ? Math.max(1, Math.round(slide.seconds / 60)) : slide.minutes;
      const right = minutes ? 900 : W - MARGIN;
      elements.push(runningHead(deck, MARGIN, 900));
      if (plan.label) {
        elements.push({ kind: 'text', role: 'body', valign: 'top', align: 'right', x: 940, y: RUNNING_HEAD_TOP - 4, w: W - MARGIN - 940, h: 34, paras: [para([labelRun(plan.label, color)])] });
      }
      elements.push(
        column({ x: MARGIN, y: 110, w: right - MARGIN - 40, h: H - 110 - 80 }, [
          para(mark(prompt, (t, c) => serif(t, kitV4PromptSize(prompt), c)), 28, 1.12),
          para([slide.routine ? sans(withoutDots(slide.routine), 22, color) : null], 12),
          para([slide.stem ?? slide.followUp ? serif((slide.stem ?? slide.followUp)!, 28, KIT_V4.body) : null], 0, 1.25),
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
          paras: [para([serif(String(minutes), 220, color)], 4, 0.9), para([sans(minutes === 1 ? 'minute' : 'minutes', 20, KIT_V4.grey)])],
        });
      }
      return out();
    }

    case 'divider': {
      const right = art ? 600 : W - MARGIN;
      elements.push(
        column({ x: MARGIN, y: 80, w: right - MARGIN, h: H - 160 }, [
          para([labelRun(plan.label, color)], 22),
          para([serif(slide.title, 80, KIT_V4.ink)], 22, 1.0),
          para([slide.subtitle ? sans(slide.subtitle, 22, KIT_V4.body) : null]),
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
      const large = isPicture ? Boolean(slide.image) : Boolean(art);
      const seconds = slide.seconds ? `${slide.seconds} seconds` : null;
      const routine = slide.routine ? withoutDots(slide.routine) : null;
      if (large) {
        const box = { x: 40, y: 40, w: 900, h: 600 };
        if (isPicture) elements.push({ kind: 'picture', id: slide.image!, ...box });
        else elements.push({ kind: 'art', src: art!.src, fit: 'contain', alt: `${art!.title}, ${art!.artist}`, ...box });
        if (!isPicture) elements.push(credit(art!, { x: 40, y: 652, w: 900, h: 30 }));
        else if (slide.attribution) elements.push({ kind: 'text', role: 'credit', valign: 'top', x: 40, y: 652, w: 900, h: 30, paras: [para([sans(slide.attribution, 15, KIT_V4.grey)])] });
      }
      const x = large ? 976 : MARGIN;
      elements.push(
        column({ x, y: 60, w: W - (large ? 64 : MARGIN) - x, h: H - 120 }, [
          para([labelRun(plan.label, color)], 16),
          para([isPicture ? sans(slide.title, 20, KIT_V4.grey) : seconds ? sans(seconds, 20, KIT_V4.grey) : null], 4),
          para([!isPicture && routine ? sans(routine, 20, KIT_V4.grey) : null], 16),
          para(question ? mark(question, (t, c) => serif(t, large ? 34 : kitV4PromptSize(question), c)) : [], 20, 1.2),
          para([slide.followUp ? serif(slide.followUp, large ? 26 : 32, color) : null], 0, 1.25),
        ])
      );
      return out();
    }

    case 'quiz': {
      const question = slide.question ?? slide.body ?? slide.title;
      const choices = (slide.choices ?? []).slice(0, 5);
      const size = Math.min(kitV4PromptSize(question), 54);
      const rowH = 64;
      const questionH = size >= 54 ? 150 : 120;
      const total = 34 + questionH + 24 + rowH * choices.length;
      const top = Math.max(96, (H - total) / 2 + 16);
      elements.push(runningHead(deck, MARGIN));
      elements.push(column({ x: MARGIN, y: top, w: W - MARGIN * 2, h: 34 + questionH }, [para([labelRun(plan.label, color)], 14), para(mark(question, (t, c) => serif(t, size, c)), 0, 1.12)], 'bottom'));
      const reveal = plan.quiz?.reveal && slide.answer ? slide.answer : null;
      choices.forEach((choice, i) => {
        const y = top + 34 + questionH + 24 + i * rowH;
        const right = reveal === i + 1;
        const greyed = reveal !== null && !right;
        if (right) elements.push({ kind: 'rect', role: 'band', fill: kitV4Band(color), x: MARGIN - 20, y, w: W - MARGIN * 2 + 40, h: rowH });
        elements.push(
          column({ x: MARGIN, y, w: W - MARGIN * 2, h: rowH }, [
            para([serif('abcde'[i]!, 34, greyed ? KIT_V4.grey : color), sans('   ', 28, KIT_V4.ink), ...mark(choice, (t, c) => sans(t, 28, greyed ? KIT_V4.grey : c))]),
          ])
        );
      });
      return out();
    }

    case 'exit': {
      const statement = slide.body ?? slide.title;
      const right = art ? 820 : W - MARGIN;
      elements.push(runningHead(deck, MARGIN));
      elements.push(
        column({ x: MARGIN, y: 96, w: right - MARGIN, h: H - 96 - 64 }, [
          para([labelRun(plan.label, color)], 22),
          para(mark(statement, (t, c) => serif(t, Math.min(kitV4PromptSize(statement), 54), c)), 22, 1.15),
          para([slide.followUp ? serif(slide.followUp, 28, KIT_V4.body) : null], 22, 1.25),
          para([slide.button ? sans(`${slide.button}: open it in Yawp!`, 24, color, true) : null], 18),
          para([slide.nextLesson ? sans(`Next time: ${slide.nextLesson}`, 20, KIT_V4.grey) : null]),
        ])
      );
      if (art) {
        elements.push({ kind: 'art', src: art.src, fit: 'contain', alt: '', x: 880, y: 200, w: 320, h: 250 });
        elements.push(credit(art, { x: 880, y: 466, w: 320, h: 60 }));
      }
      return out();
    }

    case 'compare': {
      elements.push(runningHead(deck, MARGIN));
      elements.push(column({ x: MARGIN, y: 96, w: W - MARGIN * 2, h: 130 }, [para([serif(slide.title, 52, KIT_V4.ink)], 0, 1.05)], 'bottom'));
      [slide.left, slide.right].forEach((side, i) => {
        if (!side) return;
        elements.push(
          column(
            { x: MARGIN + i * 580, y: 260, w: 520, h: H - 260 - 80 },
            [para([sans(side.label, 24, colors[i] ?? color, true)], 14), para(mark(side.text, (t, c) => sans(t, 26, c)), 0, 1.4)],
            'top'
          )
        );
      });
      return out();
    }
  }
  elements.push(column(fullColumn, [para([serif(slide.title, 52, KIT_V4.ink)])]));
  return out();
}

/** The deck, marked to be drawn in spec v4 where the school's flag is on. */
export function withDeckKit<T extends SlideDeck>(deck: T, flags: { deckKitV4: boolean }): T {
  return flags.deckKitV4 ? { ...deck, kit: 'v4' } : deck;
}

export function isKitV4(deck: Pick<SlideDeck, 'kit'>): boolean {
  return deck.kit === 'v4';
}
