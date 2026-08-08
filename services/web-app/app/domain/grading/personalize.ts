export function firstNameFromFullName(name: string | null | undefined) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Student';
  const first = trimmed.split(/\s+/)[0]?.trim();
  return first || 'Student';
}

/**
 * Every name part after the first (e.g. the last name, or a middle name).
 * Used to also redact those parts out of free-text a student wrote (an
 * essay body, a document, a chat message) - `firstNameFromFullName` alone
 * only protects the first name, but a student who signs their work with
 * their full name ("-- Sophia Marín") would otherwise still send their
 * last name to the AI provider unredacted.
 */
export function restOfNameFromFullName(
  name: string | null | undefined
): string[] {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).slice(1);
}
