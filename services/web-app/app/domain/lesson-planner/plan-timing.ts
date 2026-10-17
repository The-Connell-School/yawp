/**
 * Does the plan fit the period? (Brian's run 2, B2.)
 *
 * "It actually gave me too much stuff, probably for a 50-minute class." The
 * planner is told to fit the period, but nothing checked; a plan or deck that
 * runs long now says so where the teacher can see it.
 */

/** The upper end of "8 min", "10–12 min", "8 minutes". */
function minutesIn(text: string): number | null {
  const match = text.match(/(\d{1,3})\s*(?:[–—-]\s*(\d{1,3})\s*)?(?:min|minutes?)\b/i);
  if (!match) return null;
  return Number(match[2] ?? match[1]);
}

const HEADING = /^\s{0,3}(#{2,3})\s+(.+)$/gm;
const BOLD_STEP = /^\s{0,3}(?:(?:[-*+]|\d+[.)])\s+)?\*\*([^*\n]{1,80})\*\*([^\n]{0,40})/gm;

/**
 * Total minutes of a plan's steps: its `##` steps (or `###` when the plan
 * uses those for steps), else its bold, timed steps. The `#` title, which
 * often names the whole period, is never counted. Null when nothing is timed.
 */
export function planMinutes(body: string): number | null {
  const byLevel = new Map<number, number[]>();
  for (const match of body.matchAll(HEADING)) {
    const minutes = minutesIn(match[2]!);
    if (minutes === null) continue;
    const level = match[1]!.length;
    byLevel.set(level, [...(byLevel.get(level) ?? []), minutes]);
  }
  // The shallowest level that times more than one step is the plan's steps;
  // deeper timed headings are parts of a step.
  for (const level of [2, 3]) {
    const steps = byLevel.get(level);
    if (steps && steps.length >= 2) return steps.reduce((a, b) => a + b, 0);
  }
  const bold = [...body.matchAll(BOLD_STEP)]
    .map((match) => minutesIn(`${match[1]} ${match[2]}`))
    .filter((minutes): minutes is number => minutes !== null);
  if (bold.length >= 2) return bold.reduce((a, b) => a + b, 0);
  const single = [...byLevel.values()].flat();
  return single.length ? single.reduce((a, b) => a + b, 0) : null;
}

/** Minutes past the period, or null when it fits or either is unknown. */
export function overTime(
  planned: number | null,
  period: number | null | undefined
): number | null {
  if (!planned || !period) return null;
  return planned > period ? planned - period : null;
}
