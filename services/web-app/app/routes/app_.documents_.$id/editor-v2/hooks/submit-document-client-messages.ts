/** Copy from submit-document JSON responses that is safe to show in toasts. */
const SUBMIT_DOCUMENT_USER_SAFE_MESSAGES = new Set([
  'This document changed before it could be submitted. Please refresh and try again.',
]);

export const SUBMIT_DOCUMENT_GENERIC_ERROR = 'Submission failed.';

export function submitDocumentErrorTextForClient(
  message: string | null | undefined,
  fallback = SUBMIT_DOCUMENT_GENERIC_ERROR,
): string {
  const trimmed = message?.trim();
  if (trimmed && SUBMIT_DOCUMENT_USER_SAFE_MESSAGES.has(trimmed)) {
    return trimmed;
  }
  return fallback;
}
