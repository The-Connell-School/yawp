/**
 * Minutes that add up to the period (S9; Nov 24 types test). The deck's
 * minutes already follow the plan (deck-plan-minutes.ts), but the plan itself
 * still ran long or short: the Douglass memoir lesson was 57 minutes, the
 * Gettysburg Address 55 and Macbeth 47, each for a 50-minute period, and only
 * the teacher was told. Now the plan's own step minutes are brought to the
 * period before the deck is matched to it.
 *
 * The difference is taken from (or given to) the longest step that is not
 * writing time, then the next longest, never leaving a step under two
 * minutes: students' writing time is the last thing to give (Y1). A plan far
 * from the period (a two-day plan, a block written for one period) is left
 * as it is, for the teacher to see.
 */
import { readPlanSteps } from './plan-steps';

/** Steps whose minutes are students' writing, kept when time is cut. */
const WRITING_STEP = /\b(?:write|writing|written|short response|class starter|starter|exit (?:ticket|slip)|quick ?write|daily pages|journal)\b/i;

/** "(14 min)", "14 minutes", "10–12 min" in a step's heading line. */
const MINUTES = /(\d{1,3})((?:\s*[–—-]\s*\d{1,3})?)(\s*(?:min|minutes?)\b)/i;

const SHORTEST_STEP = 2;
/** How far a plan may be from the period and still be fitted to it. */
const MAX_SHARE = 0.34;

/** The plan with its timed steps adding up to the period; otherwise the reply as it was. */
export function planFittingPeriod(reply: string, period: number | null | undefined): string {
  if (!period || period <= 0) return reply;
  const steps = readPlanSteps(reply)
    .map((step) => {
      // A step's place may begin at the line break before its heading.
      const lineStart = step.at + (/^\s*/.exec(reply.slice(step.at, step.at + 8))?.[0].length ?? 0);
      const lineEnd = reply.indexOf('\n', lineStart);
      const line = reply.slice(lineStart, lineEnd < 0 ? reply.length : lineEnd);
      const match = MINUTES.exec(line);
      return match && step.minutes != null && step.minutes > 0
        ? { title: step.title, minutes: step.minutes, start: lineStart + match.index, length: match[0].length, unit: match[3]! }
        : null;
    })
    .filter((step): step is NonNullable<typeof step> => step !== null);
  if (steps.length < 2) return reply;
  const planned = steps.reduce((sum, step) => sum + step.minutes, 0);
  const gap = period - planned;
  if (gap === 0 || Math.abs(gap) / Math.max(planned, period) > MAX_SHARE) return reply;

  const next = steps.map((step) => step.minutes);
  const order = steps
    .map((step, index) => ({ step, index }))
    .sort(
      (a, b) =>
        Number(WRITING_STEP.test(a.step.title)) - Number(WRITING_STEP.test(b.step.title)) ||
        b.step.minutes - a.step.minutes ||
        a.index - b.index
    );
  let left = gap;
  for (const { index } of order) {
    if (left === 0) break;
    const now = next[index]!;
    const to = Math.max(SHORTEST_STEP, now + left);
    left -= to - now;
    next[index] = to;
  }
  if (left !== 0) return reply;

  let out = reply;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (next[i] === step.minutes) continue;
    out = `${out.slice(0, step.start)}${next[i]}${step.unit}${out.slice(step.start + step.length)}`;
  }
  return out;
}

/** "50 minutes:", "a 45-minute lesson", "80 min blocks": a class period the request names. */
const PERIOD = /\b(\d{2,3})[\s-]*(?:minutes?|mins?)\b/gi;
const SHORTEST_PERIOD = 20;
const LONGEST_PERIOD = 240;

/**
 * The period a request names, when the length was not stored from it (fiction
 * run, Nov 28: "for 10th grade, 50 minutes: introduce the novel" was missed,
 * and a 55-minute plan went out for a 50-minute class). The first length a
 * class period can have; a step's few minutes are not one.
 */
export function periodOf(request: string | null | undefined): number | null {
  for (const match of (request ?? '').matchAll(PERIOD)) {
    const minutes = Number(match[1]);
    if (minutes >= SHORTEST_PERIOD && minutes <= LONGEST_PERIOD) return minutes;
  }
  return null;
}
