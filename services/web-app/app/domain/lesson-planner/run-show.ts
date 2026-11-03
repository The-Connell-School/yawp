/**
 * Run the show (stack page redesign): the clock and which slide goes with
 * which step. Overtime is calm — amber, "past the plan. No rush." — never red
 * and never flashing, and the heads-up is for the teacher's screen only.
 */
import type { SlideDeck } from './slide-deck';

export const CLOCK_MODES = ['off', 'stopwatch', 'countdown'] as const;
export type ClockMode = (typeof CLOCK_MODES)[number];

/** "4:05", or "1:02:09" past an hour. */
export function clockText(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

export type Countdown = {
  /** Seconds left in the step; 0 once past it. */
  left: number;
  /** Seconds past the plan; 0 while inside it. */
  over: number;
  /** 0 to 1, how much of the step is spent. */
  progress: number;
  /** Two minutes or less left, and not over yet. */
  headsUp: boolean;
};

export function countdown(elapsedSeconds: number, plannedMinutes: number): Countdown {
  const planned = Math.max(1, plannedMinutes) * 60;
  const left = Math.max(0, planned - elapsedSeconds);
  const over = Math.max(0, elapsedSeconds - planned);
  return {
    left,
    over,
    progress: Math.min(1, elapsedSeconds / planned),
    headsUp: left > 0 && left <= 120,
  };
}

/**
 * The slide for a step: one the deck marked with this step, else one whose
 * title shares the step's words, else the step's place in the deck.
 */
export function slideForStep(
  deck: Pick<SlideDeck, 'slides'> | null,
  stepIndex: number,
  steps: Array<{ title: string }>
): number | null {
  if (!deck?.slides.length) return null;
  const marked = deck.slides.findIndex((slide) => (slide as { step?: number }).step === stepIndex + 1);
  if (marked >= 0) return marked;
  const words = (steps[stepIndex]?.title ?? '')
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((word) => word.length > 3);
  if (words.length) {
    const titled = deck.slides.findIndex((slide) => {
      const title = slide.title.toLowerCase();
      return words.filter((word) => title.includes(word)).length >= Math.min(2, words.length);
    });
    if (titled >= 0) return titled;
  }
  // A title slide usually comes first, so step 1 is slide 2.
  const offset = deck.slides[0]?.layout === 'title' ? 1 : 0;
  return Math.min(deck.slides.length - 1, stepIndex + offset);
}
