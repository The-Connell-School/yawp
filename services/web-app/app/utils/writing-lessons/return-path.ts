/**
 * Validates a `from` return path passed to the lesson page so "Back to
 * practice" can send a student back to the exact assigned exercise they were
 * working on. Only same-origin assigned-practice paths are allowed, so the
 * param can never be used as an open redirect.
 */
const ASSIGNED_PATH = /^\/app\/writing-lessons\/assigned\/[A-Za-z0-9_-]+$/;

export function safeAssignedReturnPath(value: string | null): string | null {
  if (!value) return null;
  return ASSIGNED_PATH.test(value) ? value : null;
}
