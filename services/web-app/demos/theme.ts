/**
 * Look and feel for demo videos.
 *
 * The palette is lifted from the app's own tokens in `app/app.css` so a demo
 * reads as an extension of the product rather than generic screen-capture
 * chrome. If the brand colors change there, change them here too.
 */

export const THEME = {
  /** --primary: warm terracotta. Cursor ring, spotlight, card kicker. */
  accent: '#d27151',
  /** --background (light): warm cream. */
  paper: '#f7f5ee',
  /** --background (dark): warm near-black. Title and end cards. */
  ink: '#252523',
  captionBackground: 'rgba(28, 27, 25, 0.86)',
  captionForeground: '#faf8f3',
  scrimColor: 'rgba(24, 23, 21, 0.55)',
  fontStack:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, Roboto, Helvetica, Arial, sans-serif',
} as const;

/**
 * Frame geometry.
 *
 * 1280x800 is a deliberate compromise: wide enough that the app's real layout
 * (sidebar plus content) is not cramped into a mobile shape, small enough that
 * body text stays legible after Slack scales the player down.
 */
export const FRAME = {
  width: 1280,
  height: 800,
  /** Capture at 2x so text stays sharp through the downscale. */
  deviceScaleFactor: 2,
  fps: 30,
  /** H.264 quality. 20 is visually clean for flat UI at this size. */
  crf: 20,
} as const;

/** Default beat lengths, in milliseconds. */
export const BEATS = {
  /** How long the opening title card holds before the app appears. */
  titleCard: 2200,
  /** How long the closing card holds. */
  endCard: 2600,
  /** Pause after a click, so the viewer sees the result before moving on. */
  afterClick: 650,
  /** Pause after a page settles, before the next caption. */
  afterNavigate: 500,
  /** Cross-fade used by cards and captions. */
  fade: 340,
} as const;
