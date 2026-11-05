/**
 * The gallery deck (Yawp! Lesson Deck Kit, spec v3, "The gallery and the
 * page"): which of the twelve templates each slide is, the italic mode word
 * over it (only when it does a job), its ground, its color, where the
 * painting hangs, and the deck's rhythm. Shared by Present, Run the show and
 * the PowerPoint export, so all three hang the same deck.
 */
import type { Slide, SlideDeck } from './slide-deck';
import { resolveDeckArt } from './deck-art';
import { deckColors, slideColor } from './deck-colors';

/** The kit's twelve templates, plus compare for a classic two-column slide. */
export type GalleryTemplate =
  | 'title'
  | 'agenda'
  | 'steps'
  | 'discuss'
  | 'big_idea'
  | 'write'
  | 'notes'
  | 'divider'
  | 'read'
  | 'look'
  | 'excerpt'
  | 'exit'
  | 'compare';

export type GalleryGround = 'paper' | 'pine' | 'ink' | 'accent' | 'art';

/** Spec v3 color tokens. Deck colors come from the painting (deck-colors.ts). */
export const GALLERY_COLORS = {
  paper: '#F3F0E8',
  mat: '#E6DFD0',
  white: '#FFFFFF',
  sheet: '#FBFAF6',
  rule: '#D8D0C1',
  stone: '#6F6A63',
  ink: '#1B1B1B',
  pine: '#1F3532',
  /** The mode word on pine or ink. */
  accentOnDark: '#E8906F',
  /** Hairlines on dark grounds: solid, never translucent white. */
  pineRule: '#4A5C59',
  inkRule: '#3A3936',
} as const;

/**
 * Georgia for anything a student reads as an idea, Arial for instructions,
 * labels and facts: they ship with PowerPoint and appear in Google Slides.
 * On screen, Gelasio and Arimo (the same metrics) stand in where a machine
 * has neither, a Chromebook for one.
 */
export const GALLERY_FONTS = {
  serif: "Georgia, Gelasio, 'Times New Roman', serif",
  sans: "Arial, Arimo, 'Liberation Sans', Helvetica, sans-serif",
} as const;

/** The web stand-ins for Georgia and Arial, loaded only where a deck shows. */
export const GALLERY_FALLBACK_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&family=Gelasio:ital,wght@0,400;1,400&display=swap';

/** Each template's mode word (when it has one) and its ground. */
export const GALLERY_TEMPLATES: Record<GalleryTemplate, { mode: string | null; ground: GalleryGround }> = {
  title: { mode: null, ground: 'paper' },
  // Replaces the agenda's headline.
  agenda: { mode: 'Today’s program', ground: 'paper' },
  steps: { mode: 'Do.', ground: 'paper' },
  discuss: { mode: 'Talk.', ground: 'paper' },
  // Optional: only when the deck asks for it.
  big_idea: { mode: null, ground: 'paper' },
  write: { mode: 'Write.', ground: 'pine' },
  notes: { mode: 'Know this.', ground: 'paper' },
  // Its writing-process step, else its part (see modeFor).
  divider: { mode: null, ground: 'art' },
  read: { mode: 'Read.', ground: 'paper' },
  look: { mode: 'Look.', ground: 'ink' },
  excerpt: { mode: 'Annotate.', ground: 'paper' },
  exit: { mode: 'Before you go.', ground: 'accent' },
  compare: { mode: null, ground: 'paper' },
};

/** The six steps of the writing process, as a divider names them. */
export const WRITING_PROCESS_STEPS = [
  'pre-writing',
  'thesis',
  'introduction',
  'body paragraphs',
  'conclusion',
  'title and format',
] as const;

const FROM_CLASSIC: Record<string, GalleryTemplate> = {
  statement: 'big_idea',
  prompt: 'write',
  bullets: 'notes',
  quote: 'excerpt',
  closing: 'exit',
};

export function galleryTemplate(slide: Slide): GalleryTemplate {
  return FROM_CLASSIC[slide.layout] ?? (slide.layout as GalleryTemplate);
}

/** Prompt type by word count: 12 or fewer at 68px, up to 24 at 54, then 46. */
export function promptTypeSize(text: string): 68 | 54 | 46 {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 12) return 68;
  if (words <= 24) return 54;
  return 46;
}

export type GallerySlidePlan = {
  slide: Slide;
  template: GalleryTemplate;
  /** The italic label, or null where it would do no job. */
  mode: string | null;
  ground: GalleryGround;
  /** Pine or ink: light type. */
  dark: boolean;
  /** This slide's deck color: its mode word, accented words, numerals, rules. */
  color: string;
  /** Whether the painting appears large on this slide. */
  showArt: boolean;
};

const DARK: GalleryGround[] = ['pine', 'ink'];
/** Large appearances of the art, in the order they get it (spec v3: at most three). */
const ART_PRIORITY: GalleryTemplate[] = ['title', 'look', 'divider', 'big_idea'];
const MAX_LARGE_ART = 3;

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\s']/gu, ' ').split(/\s+/).filter(Boolean);

/** Templates whose headline is the slide's title; the rest show their prompt instead. */
const TITLED: GalleryTemplate[] = ['steps', 'notes', 'read', 'divider', 'compare', 'title'];

/** What the slide shows as its headline. */
function shownHeadline(template: GalleryTemplate, slide: Slide): string {
  if (TITLED.includes(template)) return slide.title;
  return slide.question ?? slide.body ?? '';
}

/** The mode word repeats the headline when the headline already says it. */
function repeatsHeadline(mode: string, template: GalleryTemplate, slide: Slide): boolean {
  const shown = shownHeadline(template, slide);
  const said = new Set(words(shown));
  const label = words(mode).filter((word) => !['this', 'you', 'go', 'before'].includes(word));
  if (/before you go/i.test(mode)) return /before you go/i.test(shown);
  return label.length > 0 && label.every((word) => said.has(word) || said.has(`${word}s`) || said.has(word.replace(/e$/, 'ing')));
}

function defaultMode(template: GalleryTemplate, slide: Slide): string | null {
  if (template === 'divider') {
    if (slide.processStep) return `Step ${slide.processStep}.`;
    return slide.part ? `Part ${slide.part}.` : null;
  }
  return GALLERY_TEMPLATES[template].mode;
}

function modeFor(template: GalleryTemplate, slide: Slide, previous: string | null): string | null {
  const own = slide.mode?.trim();
  if (own && own.toLowerCase() === 'none') return null;
  // The agenda's label is its headline, and the exit always closes.
  if (template === 'agenda' || template === 'exit') return own || defaultMode(template, slide);
  const mode = own || defaultMode(template, slide);
  if (!mode) return null;
  if (!own && repeatsHeadline(mode, template, slide)) return null;
  // Never on two slides in a row that do the same thing.
  if (mode === previous) return null;
  return mode;
}

/**
 * Every slide's template, mode, ground, color and art, with the kit's rhythm
 * applied: a dark slide only when none of the three before it was dark (so
 * never two in a row, at most one in four), one accent wall (the last exit),
 * the painting large at most three times. A slide that loses its ground is
 * drawn on paper; its words never change.
 */
export function planGalleryDeck(deck: SlideDeck): GallerySlidePlan[] {
  const art = resolveDeckArt(deck.art);
  const colors = galleryColors(deck);
  const templates = deck.slides.map(galleryTemplate);
  const lastExit = templates.lastIndexOf('exit');

  // Which slides hang the painting large.
  const artSlides = new Set<number>();
  if (art) {
    for (const wanted of ART_PRIORITY) {
      templates.forEach((template, index) => {
        if (template !== wanted || artSlides.size >= MAX_LARGE_ART) return;
        // The Look slide is once per deck.
        if (template === 'look' && [...artSlides].some((at) => templates[at] === 'look')) return;
        artSlides.add(index);
      });
    }
  }

  const plan: GallerySlidePlan[] = [];
  deck.slides.forEach((slide, index) => {
    const template = templates[index]!;
    let ground = GALLERY_TEMPLATES[template].ground;
    if (ground === 'accent' && index !== lastExit) ground = 'paper';
    if (ground === 'art' && !artSlides.has(index)) ground = 'paper';
    if (DARK.includes(ground) && plan.slice(-3).some((entry) => entry.dark)) ground = 'paper';
    const previous = plan[plan.length - 1]?.mode ?? null;
    const primary = template === 'title' || template === 'exit';
    plan.push({
      slide,
      template,
      mode: modeFor(template, slide, previous),
      ground,
      dark: DARK.includes(ground),
      color: primary && !slide.color ? colors[0]! : slideColor(colors, index, slide.color),
      showArt: artSlides.has(index) || (template === 'divider' && ground === 'art'),
    });
  });
  return plan;
}

/** The deck's two or three colors; the first is the primary. */
export function galleryColors(deck: SlideDeck): string[] {
  return deckColors(deck, resolveDeckArt(deck.art));
}

/** The deck's primary color: the theme accent and the accent wall. */
export function galleryAccent(deck: SlideDeck): string {
  return galleryColors(deck)[0]!;
}

const NUMBER_WORD =
  '(?:\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[ivx]{1,5})';
const LESSON_NUMBER = new RegExp(`^\\s*(?:lesson|day|week|class|session|part)\\s+${NUMBER_WORD}\\b\\s*[:·.—–-]?\\s*`, 'i');

/** "Lesson 2: Pre-Writing" → "Pre-Writing", so teachers can reorder lessons. */
export function withoutLessonNumber(title: string): string {
  const stripped = title.replace(LESSON_NUMBER, '').trim();
  return stripped || title.trim();
}

/** The small caps line over every slide but the title: unit · lesson. */
export function galleryRunningHead(deck: SlideDeck): string {
  return [deck.unit, withoutLessonNumber(deck.title)].filter(Boolean).join(' · ');
}
