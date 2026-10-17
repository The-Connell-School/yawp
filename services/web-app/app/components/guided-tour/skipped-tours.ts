/**
 * Tours skipped in this browser tab. Skipping hides a welcome card for the
 * session only; the next login greets the teacher again until they finish it.
 * Storage is scoped to a one-way digest of the authenticated session and user.
 */
const SKIPPED_KEY = 'yawp:skipped-tours';

export function readSkippedTours(scope: string): string[] {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(`${SKIPPED_KEY}:${scope}`) ?? '[]'
    );
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeSkippedTours(scope: string, ids: Iterable<string>) {
  try {
    window.sessionStorage.setItem(`${SKIPPED_KEY}:${scope}`, JSON.stringify([...ids]));
  } catch {
    // Private mode or storage off: the card just comes back on the next page load.
  }
}
