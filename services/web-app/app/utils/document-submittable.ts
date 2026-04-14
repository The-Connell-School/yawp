/**
 * Matches `api.domain.submit-document`: both html and text must be non-empty strings.
 */
export function isDocumentSubmittableContent(html: string, text: string): boolean {
  return Boolean(html && text);
}
