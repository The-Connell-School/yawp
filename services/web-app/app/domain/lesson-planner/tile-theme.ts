/**
 * Shared by the Yawp! tile deck template's two renderers — PowerPoint and
 * Present — so the two say the same thing and wear the same colours (Brian's
 * review, E1; run 2, C3).
 */
import type { ClassicSlideLayout } from './slide-deck';

/** What each kind of slide is for, said small above its title. */
export const TILE_SLIDE_EYEBROWS: Record<ClassicSlideLayout, string> = {
  title: 'Today',
  statement: 'Hold this question',
  bullets: 'Notes',
  compare: 'Side by side',
  prompt: 'Your turn',
  steps: 'How it goes',
  quote: 'From the text',
  closing: 'Before you go',
  picture: 'Look closely',
};

/**
 * The template's colours, as hex without the "#" (PowerPoint's form). The
 * HTML renderer adds the "#".
 *
 * Brian's run 2: "subtle, subtle, subtle". Full-strength brand green for small
 * marks; big blocks use the softer tint; cards are raised white tiles with a
 * faint green edge instead of a colour band.
 */
export const TILE_COLORS = {
  cream: 'F7F5EE', // --background
  paper: 'FFFEFA', // --popover
  ink: '3C3828', // --foreground
  muted: '7E7C78', // --muted-foreground
  wash: 'E6E2D6', // --accent
  rule: 'D6D4CC', // --border
  /** --primary: small marks only. */
  accent: '1F4D3A',
  /** Softer brand green on paper: title block, closing, headers. */
  accentSoft: 'C7D3CE',
  /** A faint green edge on a raised tile. */
  tileBorder: 'D7DFDC',
} as const;

/** Brand accent for CSS. */
export function css(color: keyof typeof TILE_COLORS): string {
  return `#${TILE_COLORS[color]}`;
}

/**
 * The mark at the foot of each slide (Brian's run 2, item 15: Brian and Kevin
 * to decide). `wordmark` is today's small Yawp!; `faded` is Brian's "phantom"
 * idea, the wordmark very transparent; `none` leaves it off.
 */
export type TileFooterMark = 'wordmark' | 'faded' | 'none';
export const DEFAULT_TILE_FOOTER_MARK: TileFooterMark = 'wordmark';

/** The eyebrow over a slide's title: what it is for, never how long. */
export function tileEyebrow(layout: ClassicSlideLayout): string {
  return TILE_SLIDE_EYEBROWS[layout].toUpperCase();
}

/** Minutes belong in the speaker notes, where only the teacher sees them. */
export function notesWithMinutes(notes: string, minutes: number | undefined): string {
  return minutes ? `(${minutes} min) ${notes}` : notes;
}
