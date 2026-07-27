/**
 * Pure timing helpers for demo recordings.
 *
 * Everything here is deterministic (randomness is seeded) so a demo recorded
 * twice from the same script produces the same cadence. That matters more than
 * it sounds: it makes re-recorded videos diffable by eye, and it keeps these
 * functions unit-testable without a browser.
 *
 * No DOM, no Playwright, no I/O — keep it that way.
 */

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Standard ease-in-out cubic on the unit interval.
 *
 * This is what makes the on-screen cursor read as "moved by a person" rather
 * than "linearly interpolated by a machine": it accelerates out of rest and
 * decelerates into the target.
 */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export type TravelOptions = {
  /** Cursor speed. Lower feels more deliberate, higher feels snappier. */
  pxPerSecond?: number;
  minMs?: number;
  maxMs?: number;
};

/**
 * How long the cursor should take to travel `distance` pixels.
 *
 * Linear in distance, then clamped: short hops still get enough time to be
 * legible, and a corner-to-corner move never turns into a slow crawl.
 */
export function travelDurationMs(
  distance: number,
  options: TravelOptions = {}
): number {
  const { pxPerSecond = 1400, minMs = 260, maxMs = 900 } = options;
  const safeDistance = Math.max(distance, 0);
  const raw = (safeDistance / pxPerSecond) * 1000;
  return Math.round(clamp(raw, minMs, maxMs));
}

export type CaptionOptions = {
  /** Reading speed. 160wpm is a relaxed pace for on-screen text. */
  wordsPerMinute?: number;
  minMs?: number;
  maxMs?: number;
};

/**
 * How long a caption stays on screen, derived from its reading time.
 *
 * The ceiling is deliberate: if a caption needs more than six seconds, it is
 * too long for a shareable clip and should be split into two beats.
 */
export function captionHoldMs(
  text: string,
  options: CaptionOptions = {}
): number {
  const { wordsPerMinute = 160, minMs = 1400, maxMs = 6000 } = options;
  const words = countWords(text);
  const raw = (words / wordsPerMinute) * 60_000;
  return Math.round(clamp(raw, minMs, maxMs));
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * mulberry32 — a small, fast, well-distributed seeded PRNG.
 *
 * Used instead of Math.random so typing jitter is reproducible across runs.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TypingOptions = {
  /** Median milliseconds between keystrokes. */
  baseMs?: number;
  /** Fractional spread around `baseMs`, 0 for a flat mechanical cadence. */
  jitter?: number;
  seed?: number;
};

/** Extra dwell after punctuation, so typed text breathes where a writer would. */
const SENTENCE_PAUSE = 3.2;
const CLAUSE_PAUSE = 1.8;

/**
 * Per-character keystroke delays for a string, with human-ish variation.
 *
 * `delays[i]` is the pause *before* character `i` is typed, which is why the
 * punctuation lookup reads the preceding character: a writer pauses after
 * finishing a sentence, not before starting one.
 */
export function typingDelays(
  text: string,
  options: TypingOptions = {}
): number[] {
  const { baseMs = 55, jitter = 0.35, seed = 1 } = options;
  const rng = seededRandom(seed);

  return Array.from(text, (_char, index) => {
    const previous = index > 0 ? text[index - 1] : undefined;
    let delay = baseMs * punctuationMultiplier(previous);

    if (jitter > 0) {
      delay *= 1 + (rng() * 2 - 1) * jitter;
    }

    return Math.max(1, Math.round(delay));
  });
}

function punctuationMultiplier(previousChar: string | undefined): number {
  if (!previousChar) return 1;
  if ('.?!'.includes(previousChar)) return SENTENCE_PAUSE;
  if (',;:'.includes(previousChar)) return CLAUSE_PAUSE;
  return 1;
}
