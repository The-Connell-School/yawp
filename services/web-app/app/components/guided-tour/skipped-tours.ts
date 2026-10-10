/**
 * Tours skipped in this browser tab. Skipping hides a welcome card for the
 * session only; the next login greets the teacher again until they finish it.
 * A dev sign-in (preview and local) clears it, so testers start fresh.
 */
const SKIPPED_KEY = 'yawp:skipped-tours';

export function readSkippedTours(): string[] {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(SKIPPED_KEY) ?? '[]'
    );
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeSkippedTours(ids: Iterable<string>) {
  try {
    window.sessionStorage.setItem(SKIPPED_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode or storage off: the card just comes back on the next page load.
  }
}

export function clearSkippedTours() {
  writeSkippedTours([]);
}
