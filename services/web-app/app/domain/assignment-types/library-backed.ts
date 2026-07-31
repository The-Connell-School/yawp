import { AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-english-lit/schema';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';

/**
 * Assignment types whose assignments are created from a curated prompt library
 * (and carry an immutable snapshot) rather than from a free-form prompt. These
 * are excluded from the generic quick-create and inline-edit flows: a teacher
 * must pick a library entry, which builds the snapshot.
 */
export const LIBRARY_BACKED_ASSIGNMENT_TYPE_KEYS: readonly string[] = [
  AP_HISTORY_ASSIGNMENT_TYPE_KEY,
  AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
];

export function isLibraryBackedAssignmentType(
  systemKey: string | null | undefined,
): boolean {
  return systemKey != null && LIBRARY_BACKED_ASSIGNMENT_TYPE_KEYS.includes(systemKey);
}
