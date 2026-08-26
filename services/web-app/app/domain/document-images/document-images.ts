/**
 * Student-uploaded figures for report-style assignments.
 *
 * GBA 300's International Expansion Plan rubric requires graphics: the
 * Industry Analysis band asks for "at least two graphics that communicate,"
 * and the report is expected to carry the invented company's logo and
 * supporting charts. The course does not assess whether a student can *build*
 * a chart, so this feature only has to get an image the student made
 * elsewhere into the document.
 *
 * Everything here is pure so the gate, the size cap, and the src allowlist
 * can be unit-tested and shared by the upload route, the serve route, the
 * editor extension, and the toolbar.
 */

/** Rubric name of the GBA 300 International Expansion Plan (see domain/rubrics/library). */
export const GBA300_EXPANSION_RUBRIC_NAME = 'gba300-international-expansion';

/**
 * Rubrics whose documents may carry uploaded figures. This list *is* the
 * rollout gate: it starts as the one course that asked for the feature, and
 * widening it later is a one-line change with no schema or route work.
 */
export const DOCUMENT_IMAGE_ENABLED_RUBRIC_NAMES: readonly string[] = [
  GBA300_EXPANSION_RUBRIC_NAME,
];

/**
 * Raster formats only. SVG is deliberately excluded: it is an XML document
 * that can carry script, and we serve these bytes from our own origin.
 */
export const DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type DocumentImageContentType =
  (typeof DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES)[number];

/** 8 MB. Comfortably above a screenshot of a spreadsheet chart or a logo PNG. */
export const DOCUMENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Alt text longer than this is almost certainly a pasted paragraph. */
export const DOCUMENT_IMAGE_MAX_ALT_TEXT_LENGTH = 300;

const DOCUMENT_IMAGE_SRC_PREFIX = '/api/image/document/';

/**
 * Env kill switch. Set DOCUMENT_IMAGE_UPLOAD_DISABLED=true to take the
 * feature back out of the product without a deploy of the old code: the
 * toolbar button disappears, the upload route refuses, and already-uploaded
 * figures keep rendering (the serve route is not gated, so no student loses
 * work that is already in their report).
 */
export const DOCUMENT_IMAGE_KILL_SWITCH_ENV = 'DOCUMENT_IMAGE_UPLOAD_DISABLED';

export function isDocumentImageUploadEnabled({
  rubricName,
  killSwitch,
}: {
  rubricName: string | null | undefined;
  killSwitch?: string | null;
}): boolean {
  if (killSwitch?.trim().toLowerCase() === 'true') return false;
  if (!rubricName) return false;
  return DOCUMENT_IMAGE_ENABLED_RUBRIC_NAMES.includes(rubricName);
}

export function normalizeAltText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DOCUMENT_IMAGE_MAX_ALT_TEXT_LENGTH);
}

/** The bare media type, lowercased, with any `; charset=...` parameter dropped. */
export function normalizeContentType(raw: string): string {
  return raw.split(';')[0]!.trim().toLowerCase();
}

export type DocumentImageUploadRejection =
  | 'unsupported-type'
  | 'too-large'
  | 'empty'
  | 'missing-alt-text';

export type DocumentImageUploadValidation =
  | { ok: true; contentType: DocumentImageContentType; altText: string }
  | { ok: false; reason: DocumentImageUploadRejection; message: string };

const REJECTION_MESSAGES: Record<DocumentImageUploadRejection, string> = {
  'unsupported-type': `That file type is not supported. Upload a PNG, JPEG, GIF, or WebP image.`,
  'too-large': `That image is too large. The limit is ${Math.round(
    DOCUMENT_IMAGE_MAX_BYTES / (1024 * 1024)
  )} MB.`,
  empty: 'That file is empty.',
  'missing-alt-text': 'Describe the image so screen-reader users know what it shows.',
};

export function validateDocumentImageUpload({
  contentType,
  byteSize,
  altText,
}: {
  contentType: string;
  byteSize: number;
  altText: string;
}): DocumentImageUploadValidation {
  const reject = (reason: DocumentImageUploadRejection) => ({
    ok: false as const,
    reason,
    message: REJECTION_MESSAGES[reason],
  });

  const normalizedType = normalizeContentType(contentType);
  if (
    !(DOCUMENT_IMAGE_ALLOWED_CONTENT_TYPES as readonly string[]).includes(normalizedType)
  ) {
    return reject('unsupported-type');
  }

  if (!Number.isFinite(byteSize) || byteSize <= 0) return reject('empty');
  if (byteSize > DOCUMENT_IMAGE_MAX_BYTES) return reject('too-large');

  const normalizedAlt = normalizeAltText(altText ?? '');
  if (!normalizedAlt) return reject('missing-alt-text');

  return {
    ok: true,
    contentType: normalizedType as DocumentImageContentType,
    altText: normalizedAlt,
  };
}

export function buildDocumentImageSrc(imageId: string): string {
  return `${DOCUMENT_IMAGE_SRC_PREFIX}${imageId}`;
}

/**
 * Only a same-origin src pointing at our own document-image endpoint is
 * allowed in the editor. This is what keeps a pasted `<img src="https://...">`
 * — a tracking pixel, a hotlinked asset that 404s the week after it is
 * graded — from surviving into the saved document.
 */
export function isDocumentImageSrc(src: string | null | undefined): boolean {
  return parseDocumentImageId(src) !== null;
}

export function parseDocumentImageId(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null;
  if (!src.startsWith(DOCUMENT_IMAGE_SRC_PREFIX)) return null;
  const id = src.slice(DOCUMENT_IMAGE_SRC_PREFIX.length);
  // cuid-shaped only: no slashes, no traversal, no query string.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}
