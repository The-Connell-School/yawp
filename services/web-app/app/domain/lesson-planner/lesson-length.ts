/**
 * How long this lesson is, read from the teacher's own answer (Brian's run 2,
 * B1).
 *
 * The length used to live only in that message, which scrolls out of the
 * planner's history on a long lesson, so plans and decks drifted past the
 * period ("14 slides · 57 min" for a 50-minute class). The chat action reads
 * it once, keeps it on the lesson, and tells the planner every turn.
 */

export type LessonLength = { minutes: number; classLabel: string | null };

const MIN_MINUTES = 10;
const MAX_MINUTES = 240;

function inRange(minutes: number): boolean {
  return minutes >= MIN_MINUTES && minutes <= MAX_MINUTES;
}

/** "For English 11 · Period 5, 50 minutes." — the intake v2 card's answer. */
const FOR_CLASS = /\bFor ([^,.\n]{1,80}), (\d{1,3}) minutes\./g;
/** "… 50 minutes." as its own sentence — the original slider's answer. */
const SLIDER = /(?:^|[.!?]\s+)(\d{1,3}) minutes\.(?:\s|$)/;
/** "a 45-minute period", "80 minute blocks". */
const TYPED = /\b(\d{2,3})[- ]minute (?:periods?|class(?:es)?|blocks?|lessons?)\b/i;

export function readLessonLength(message: string): LessonLength | null {
  for (const match of message.matchAll(FOR_CLASS)) {
    const minutes = Number(match[2]);
    if (inRange(minutes)) return { minutes, classLabel: match[1]!.trim() };
  }
  const slider = SLIDER.exec(message);
  if (slider && inRange(Number(slider[1]))) {
    return { minutes: Number(slider[1]), classLabel: null };
  }
  const typed = TYPED.exec(message);
  if (typed && inRange(Number(typed[1]))) {
    return { minutes: Number(typed[1]), classLabel: null };
  }
  return null;
}
