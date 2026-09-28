/**
 * Validates a `from` return path passed to the lesson page so "Back to
 * practice" can send a student back to the exact exercise they were working
 * on — an assigned set, or a self-directed practice session they started for
 * themselves. Only those same-origin practice paths are allowed, so the param
 * can never be used as an open redirect.
 */
const ASSIGNED_PATH = /^\/app\/writing-lessons\/assigned\/[A-Za-z0-9_-]+$/;
// The self-directed session carries its set in the query string (which skills,
// how many problems, an optional topic), so the query has to survive the
// round trip — but only as plain param characters, never another path.
const SESSION_PATH =
  /^\/app\/writing-lessons\/practice(\?[A-Za-z0-9_,=&%+.\- ]*)?$/;

export function safeAssignedReturnPath(value: string | null): string | null {
  if (!value) return null;
  if (ASSIGNED_PATH.test(value)) return value;
  return SESSION_PATH.test(value) ? value : null;
}
