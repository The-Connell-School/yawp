/**
 * How long a lesson took to plan, counted as time the teacher was actually
 * working on it (Nov 3). "Planned in" used to be the clock time from the
 * lesson's creation to the moment it was set, so a lesson started on Monday
 * and set on Thursday read "3 days" for twenty minutes of work.
 *
 * The page counts a second when it is in front of the teacher (visible and
 * focused) and they have touched it recently, or while they are waiting on
 * the planner's reply. The server adds what the page reports to the lesson,
 * never more than the time that has passed since the last report, and only
 * until the lesson is set.
 *
 * Lessons planned before the clock existed are estimated from what the
 * teacher did in them: the gaps between their messages and the planner's
 * replies, each gap counted only up to a working stretch, so a lunch break
 * is not planning.
 */

/** No input for this long and the page stops counting: nobody is at it. */
export const ACTIVE_IDLE_MS = 3 * 60_000;
/** The most one report can add. The page reports every 30 seconds. */
export const MAX_PING_SECONDS = 120;
/** How often the page reports what it has counted. */
export const ACTIVE_FLUSH_MS = 30_000;
/** In an estimate, the longest gap between two actions that still counts as work. */
const ESTIMATE_GAP_CAP_SECONDS = 5 * 60;
/** In an estimate, a lesson with one action took at least a minute. */
const ESTIMATE_FLOOR_SECONDS = 60;

export type ActiveClock = { pending: number; lastInput: number };

/** One second of the page's clock: whether it counts. */
export function activeTick(
  clock: ActiveClock,
  { now, visible, focused, waiting = false }: { now: number; visible: boolean; focused: boolean; waiting?: boolean }
): ActiveClock {
  const working = visible && focused && (waiting || now - clock.lastInput <= ACTIVE_IDLE_MS);
  return working ? { ...clock, pending: clock.pending + 1 } : clock;
}

/**
 * What the server credits for one report: a whole number of seconds, at most
 * the cap, and at most the time since the last report (plus a little slack),
 * so two tabs or a replayed request cannot count the same minute twice.
 */
export function clampPing(seconds: number, lastReport: Date | null, now: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  let allowed = Math.min(Math.floor(seconds), MAX_PING_SECONDS);
  if (lastReport) allowed = Math.min(allowed, Math.max(0, Math.floor((now - lastReport.getTime()) / 1000) + 5));
  return allowed;
}

/** Working time read off a lesson's timestamps, for lessons the clock never saw. */
export function estimateActiveSeconds(events: Date[]): number {
  if (!events.length) return 0;
  const times = events.map((event) => event.getTime()).sort((a, b) => a - b);
  let seconds = 0;
  for (let index = 1; index < times.length; index += 1) {
    seconds += Math.min(ESTIMATE_GAP_CAP_SECONDS, Math.max(0, (times[index]! - times[index - 1]!) / 1000));
  }
  return Math.max(ESTIMATE_FLOOR_SECONDS, Math.round(seconds));
}

/**
 * The lesson's planning time: the clock, plus an estimate for any part of the
 * lesson that happened before the clock started counting it.
 */
export function planningSeconds({
  activeSeconds,
  activeSince,
  events,
}: {
  activeSeconds: number;
  /** When the clock first counted this lesson; null if it never has. */
  activeSince: Date | null;
  /** When the teacher and the planner did something in the lesson. */
  events: Date[];
}): number {
  const before = activeSince ? events.filter((event) => event < activeSince) : events;
  // The clock saw the lesson from (about) its start: nothing to estimate.
  if (activeSince && before.length === 0) return activeSeconds;
  const estimated = estimateActiveSeconds(activeSince ? [...before, activeSince] : before);
  return estimated + activeSeconds;
}

export function formatPlanningTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}
