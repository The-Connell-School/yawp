/**
 * The gallery deck (Yawp! Lesson Deck Kit, "The gallery and the page"): which
 * of the twelve templates each slide is, the italic mode word over it, its
 * ground, and the deck's rhythm. Shared by Present, Run the show and the
 * PowerPoint export, so all three hang the same deck.
 */
import { DECK_ACCENTS, type DeckAccent, type Slide, type SlideDeck } from './slide-deck';
import { deckArt } from './deck-art';

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

export const GALLERY_COLORS = {
  paper: '#F3F0E8',
  mat: '#E6DFD0',
  white: '#FFFFFF',
  sheet: '#FBFAF6',
  rule: '#D8D0C1',
  stone: '#6F6A63',
  ink: '#1B1B1B',
  pine: '#1F3532',
  /** The accent, lifted for a dark ground. */
  accentOnDark: '#E8906F',
} as const;

export const GALLERY_ACCENTS: Record<DeckAccent, string> = {
  ember: '#B75F44',
  indigo: '#2F5873',
  olive: '#56602F',
  plum: '#7A4560',
};

export const GALLERY_FONTS = {
  serif: "'Cormorant Garamond', Georgia, serif",
  sans: "'Libre Franklin', 'Franklin Gothic Book', Arial, sans-serif",
} as const;

/** Each template's mode word and ground, as the kit draws it. */
export const GALLERY_TEMPLATES: Record<GalleryTemplate, { mode: string | null; ground: GalleryGround }> = {
  title: { mode: null, ground: 'paper' },
  agenda: { mode: 'Today.', ground: 'paper' },
  steps: { mode: 'Do.', ground: 'paper' },
  discuss: { mode: 'Talk.', ground: 'paper' },
  big_idea: { mode: 'Hold this.', ground: 'paper' },
  write: { mode: 'Write.', ground: 'pine' },
  notes: { mode: 'Know.', ground: 'paper' },
  divider: { mode: 'Part.', ground: 'art' },
  read: { mode: 'Read.', ground: 'paper' },
  look: { mode: 'Look.', ground: 'ink' },
  excerpt: { mode: 'Annotate.', ground: 'paper' },
  exit: { mode: 'Before you go.', ground: 'accent' },
  compare: { mode: 'Compare.', ground: 'paper' },
};

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

/** Prompt type by word count: 12 words or fewer at 80px, 24 at 64, then 54. */
export function promptTypeSize(text: string): 80 | 64 | 54 {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 12) return 80;
  if (words <= 24) return 64;
  return 54;
}

export type GallerySlidePlan = {
  slide: Slide;
  template: GalleryTemplate;
  mode: string | null;
  ground: GalleryGround;
  /** Pine or ink: white type. */
  dark: boolean;
};

const DARK: GalleryGround[] = ['pine', 'ink'];

/**
 * Every slide's template, mode and ground, with the kit's rhythm applied: a
 * dark slide only when none of the three before it was dark (so never two in
 * a row, and at most one in four), one accent wall (the last exit), and art
 * only when the deck hangs a work. A slide that loses its ground is drawn on
 * paper; its words never change.
 */
export function planGalleryDeck(deck: SlideDeck): GallerySlidePlan[] {
  const hasArt = deckArt(deck.art) !== null;
  const lastExit = deck.slides.map(galleryTemplate).lastIndexOf('exit');
  const plan: GallerySlidePlan[] = [];
  deck.slides.forEach((slide, index) => {
    const template = galleryTemplate(slide);
    const base = GALLERY_TEMPLATES[template];
    let ground = base.ground;
    if (ground === 'accent' && index !== lastExit) ground = 'paper';
    if (ground === 'art' && !hasArt) ground = 'paper';
    if (DARK.includes(ground) && plan.slice(-3).some((entry) => entry.dark)) ground = 'paper';
    let mode = slide.mode ?? base.mode;
    if (template === 'divider' && !slide.mode) mode = slide.part ? `Part ${slide.part}.` : null;
    plan.push({ slide, template, mode, ground, dark: DARK.includes(ground) });
  });
  return plan;
}

export function galleryAccent(deck: SlideDeck): string {
  const accent = deck.accent && DECK_ACCENTS.includes(deck.accent) ? deck.accent : 'ember';
  return GALLERY_ACCENTS[accent];
}

/** The small caps line over every slide but the title. */
export function galleryRunningHead(deck: SlideDeck): string {
  return [deck.unit, deck.title].filter(Boolean).join(' · ');
}
