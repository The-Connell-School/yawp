/**
 * Shared by the YAWP! tile deck template's two renderers — PowerPoint and
 * Present — so the two say the same thing and wear the same colours (Brian's
 * review, E1; run 2, C3).
 */
import type { SlideLayout } from './slide-deck';

/** What each kind of slide is for, said small above its title. */
export const TILE_SLIDE_EYEBROWS: Record<SlideLayout, string> = {
  title: 'Today',
  statement: 'Hold this question',
  bullets: 'Notes',
  compare: 'Side by side',
  prompt: 'Your turn',
  steps: 'How it goes',
  quote: 'From the text',
  closing: 'Before you go',
};

/**
 * The template's colours, as hex without the "#" (PowerPoint's form). The
 * HTML renderer adds the "#".
 *
 * Brian's run 2: "subtle, subtle, subtle". Full-strength terracotta stays for
 * small marks (eyebrows, numerals, a quote mark, a hairline bar); big blocks
 * use the softer orange, and cards are raised white tiles with a faint orange
 * border instead of an orange band.
 */
export const TILE_COLORS = {
  cream: 'F7F5EE', // --background
  paper: 'FFFEFA', // --popover
  ink: '3C3828', // --foreground
  muted: '7E7C78', // --muted-foreground
  wash: 'E6E2D6', // --accent
  rule: 'D6D4CC', // --border
  /** --primary: small marks only. */
  accent: 'D27151',
  /** About half-strength terracotta on paper: title block, closing, headers. */
  accentSoft: 'EBC0AE',
  /** A faint orange edge on a raised tile. */
  tileBorder: 'F1D5C9',
} as const;

/** "#D27151" for CSS. */
export function css(color: keyof typeof TILE_COLORS): string {
  return `#${TILE_COLORS[color]}`;
}

/**
 * The mark at the foot of each slide (Brian's run 2, item 15: Brian and Kevin
 * to decide). `wordmark` is today's small YAWP!; `faded` is Brian's "phantom"
 * idea, the wordmark very transparent; `none` leaves it off.
 */
export type TileFooterMark = 'wordmark' | 'faded' | 'none';
export const DEFAULT_TILE_FOOTER_MARK: TileFooterMark = 'wordmark';

/** The eyebrow over a slide's title: what it is for, never how long. */
export function tileEyebrow(layout: SlideLayout): string {
  return TILE_SLIDE_EYEBROWS[layout].toUpperCase();
}

/** Minutes belong in the speaker notes, where only the teacher sees them. */
export function notesWithMinutes(notes: string, minutes: number | undefined): string {
  return minutes ? `(${minutes} min) ${notes}` : notes;
}
