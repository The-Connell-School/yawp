/**
 * The hybrid look for the Thesis-Driven Essay lesson decks.
 *
 * Two parents:
 * - The lesson planner's YAWP! tile template (PR #437, `tile-theme.ts` and
 *   `lesson-pptx-tile.server.ts`): a warm cream page, raised paper tiles with
 *   a faint border and soft shadow, a mono eyebrow over a serif title, and a
 *   small YAWP! wordmark with the slide number at the foot.
 * - Brian's original teacher decks: bright teal, sunshine, orange, coral and
 *   pink bubbles, white line icons in coloured circles, yellow highlighter on
 *   the words that matter.
 *
 * The tile template supplies the structure and calm; Brian's palette supplies
 * the energy, used as accents (tile bands, numerals, bubbles, highlighter)
 * rather than full-bleed blocks, so text still reads from the back row.
 *
 * The neutral values mirror `TILE_COLORS` in PR #437; once that lands this
 * file can import them instead of repeating them.
 */

export const HYBRID = {
  // From the tile template.
  cream: 'F7F5EE',
  paper: 'FFFEFA',
  ink: '3C3828',
  muted: '7E7C78',
  wash: 'E6E2D6',
  rule: 'D6D4CC',
  terracotta: 'D27151',
  // From Brian's decks.
  teal: '02BDC7',
  sunshine: 'FFB600',
  orange: 'FF9755',
  coral: 'FC4540',
  pink: 'FC4067',
  highlighter: 'FFE14D',
  /** A pale teal for big quiet blocks (the title band, section pages). */
  tealSoft: 'C8EEF0',
  /** A pale sunshine for the Pro-tip sticker and the closing page. */
  sunshineSoft: 'FFE9B3',
  // Faces: PowerPoint can't embed web fonts, so these are on every machine.
  serif: 'Georgia',
  sans: 'Calibri',
  mono: 'Consolas',
} as const;

export type HybridColor = keyof typeof HYBRID;

/** Brian's five bubble colours, in the order tiles and numerals cycle them. */
export const ACCENT_CYCLE = ['teal', 'sunshine', 'coral', 'orange', 'pink'] as const;
export type AccentColor = (typeof ACCENT_CYCLE)[number];

export function accentAt(index: number): AccentColor {
  return ACCENT_CYCLE[index % ACCENT_CYCLE.length];
}

/** The white line icons that sit in Brian's coloured bubbles. */
export const ICONS = [
  'lightbulb',
  'puzzle',
  'thumbs',
  'eye',
  'diamond',
  'pencil',
  'timer',
  'question',
] as const;
export type IconName = (typeof ICONS)[number];
