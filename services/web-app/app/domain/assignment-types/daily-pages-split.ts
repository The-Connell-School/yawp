/**
 * The rollout switch for splitting Daily Pages in two.
 *
 * Daily Pages used to be one thing: an open-ended prompt graded softly on
 * whether the student showed up to the writing. It becomes two things — Class
 * Starter, which is that assignment unchanged, and Daily Pages, which is a
 * thoughtful reflection on an assigned text or topic and asks more of the
 * student.
 *
 * Class Starter is purely additive and needs no flag. What this flag guards is
 * the one behaviour change: which grading assistant a `daily_pages` assignment
 * type falls back to when it has saved no rubric of its own. Off — the default
 * — every existing Daily Pages row grades exactly as it does today, so the
 * flag can be turned on for a pilot and back off without touching data.
 */
export type DailyPagesSplitEnv = {
  DAILY_PAGES_SPLIT_ENABLED?: string;
};

/**
 * The browser bundle has no `process`, and this module is reachable from
 * client code through the rubric config. Reading the flag there reports the
 * feature off rather than throwing.
 */
function readAmbientEnv(): DailyPagesSplitEnv {
  if (typeof process === 'undefined' || !process.env) return {};
  return process.env as DailyPagesSplitEnv;
}

/**
 * Only the exact string `'true'` turns the split on, so a half-set deploy
 * variable cannot quietly change how live submissions are graded.
 */
export function isDailyPagesSplitEnabled(
  env: DailyPagesSplitEnv = readAmbientEnv()
): boolean {
  return env.DAILY_PAGES_SPLIT_ENABLED === 'true';
}
