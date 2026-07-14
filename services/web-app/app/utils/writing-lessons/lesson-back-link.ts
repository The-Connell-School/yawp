// The writing-lessons library index. Reviewing a skill from here (or via a
// direct link) should send the student back here when they're done.
export const PRACTICE_HOME = '/app/writing-lessons';

/**
 * Resolves where the lesson detail page's "Back to practice" link should go.
 *
 * A student can reach a lesson two ways:
 *  - from the practice library, where "back" means the library index, or
 *  - by clicking "Review lesson" mid-exercise (an assigned practice or a
 *    self-directed session), where "back" must return them exactly to where
 *    they were so the review never interrupts their practice.
 *
 * The exercise passes its own path in the `from` query param. We only honor it
 * when it's an internal writing-lessons path — never an arbitrary or absolute
 * URL — so this can't be turned into an open redirect. Anything unrecognized
 * falls back to the library index (the previous behavior).
 */
export function resolveBackToPracticeHref(
  from: string | null | undefined
): string {
  if (!from) return PRACTICE_HOME;

  let parsed: URL;
  try {
    // Resolve against a dummy base so only root-relative inputs are accepted;
    // absolute and protocol-relative URLs resolve to a different origin.
    parsed = new URL(from, 'http://internal.invalid');
  } catch {
    return PRACTICE_HOME;
  }

  // Reject anything that escaped to another origin (absolute or `//host` URLs).
  if (parsed.origin !== 'http://internal.invalid') return PRACTICE_HOME;

  const path = parsed.pathname;
  if (path !== PRACTICE_HOME && !path.startsWith(`${PRACTICE_HOME}/`)) {
    return PRACTICE_HOME;
  }

  // Preserve any query string (e.g. a self-directed session's skills/count).
  return `${path}${parsed.search}`;
}
