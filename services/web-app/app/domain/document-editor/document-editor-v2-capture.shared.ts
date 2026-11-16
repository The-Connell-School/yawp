/** Preview-only query hooks for v2 design capture (?v2Capture=). */

export const DOCUMENT_EDITOR_V2_CAPTURE_PARAM = 'v2Capture';

export const DOCUMENT_EDITOR_V2_CAPTURE_STATES = [
  'loading',
  'empty',
  'error',
  'saving',
  'submitted',
  'comments-reply-resolved',
] as const;

export type DocumentEditorV2CaptureState =
  (typeof DOCUMENT_EDITOR_V2_CAPTURE_STATES)[number];

export function parseDocumentEditorV2Capture(
  raw: string | null | undefined
): DocumentEditorV2CaptureState | null {
  const value = raw?.trim();
  if (!value) return null;
  return (DOCUMENT_EDITOR_V2_CAPTURE_STATES as readonly string[]).includes(value)
    ? (value as DocumentEditorV2CaptureState)
    : null;
}