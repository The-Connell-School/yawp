/**
 * What a lesson is called where a teacher reads it (Brian's round 3, 1.1).
 * No imports, so anything that shows a title can use it.
 */

/** `{type: context}`, `[type: thesis_essay]`: the planner's tags, never a teacher's. */
const TAG = /\{[^{}]*\}|\[\s*[a-z_ ]{2,24}\s*:[^\]]*\]/gi;
/** "(50 min)", "(45–50 minutes)", or a trailing "· 50 min". */
const DURATION =
  /\(\s*(?:\d{1,3}\s*[–—-]\s*)?(\d{1,3})\s*(?:min|mins|minutes?)\.?\s*\)|\s[·|—–-]\s*(?:\d{1,3}\s*[–—-]\s*)?(\d{1,3})\s*(?:min|mins|minutes?)\.?\s*$/i;

/**
 * A lesson's name with what the planner wrote for the app taken out (Brian's
 * round 3, 1.1): "Day 1: The Man Who Made Himself (50 min) {type: context}"
 * is "Day 1: The Man Who Made Himself" everywhere it shows. A title that is
 * nothing but tags is left as it was rather than emptied.
 */
export function cleanLessonTitle(raw: string): string {
  const title = raw.trim();
  const cleaned = title
    .replace(TAG, ' ')
    .replace(new RegExp(DURATION.source, 'gi'), ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[:·|—–-]\s*$/, '')
    .trim();
  return cleaned || title;
}

/**
 * The period a title gave ("(50 min)"), for a lesson whose period was never
 * stored (Brian's round 3, 1.2). A step's few minutes are not a period.
 */
export function minutesInTitle(raw: string): number | null {
  const match = DURATION.exec(raw.replace(TAG, ' ').trim());
  const minutes = match ? Number(match[1] ?? match[2]) : NaN;
  return minutes >= 10 && minutes <= 240 ? minutes : null;
}
