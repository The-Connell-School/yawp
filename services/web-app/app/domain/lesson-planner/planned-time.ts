/**
 * "Planned in" (Brian's round 5, item 12): the time a teacher actually spent
 * on a lesson, not the clock time from the first message to set. A lesson set
 * after 20 minutes and touched again the next day for one more reads about 21
 * minutes, not 21 hours.
 *
 * It is read from what the lesson already records: every message, every piece
 * added to or edited in the stack, every assignment made, and the set itself.
 * Time between two of those counts while the gap is short; a longer gap is a
 * tab left open, or another day, and counts as the one minute of the step
 * that ends it.
 */

/** A gap this long or longer is idle. */
export const IDLE_GAP_MINUTES = 10;

export function plannedMinutes(times: Array<Date | string | number | null | undefined>): number {
  const sorted = [
    ...new Set(
      times
        .filter((time): time is Date | string | number => time != null)
        .map((time) => new Date(time).getTime())
        .filter((time) => Number.isFinite(time))
    ),
  ].sort((a, b) => a - b);
  let total = 0;
  for (let index = 1; index < sorted.length; index++) {
    const gap = (sorted[index]! - sorted[index - 1]!) / 60_000;
    total += gap < IDLE_GAP_MINUTES ? gap : 1;
  }
  return Math.max(1, Math.round(total));
}

/** "21 min", "2.5 hr". */
export function plannedLabel(minutes: number): string {
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return `${hours} hr`;
}
