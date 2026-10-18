/**
 * Screenshots and photos on Faculty Lounge posts (Brian, round 6; behind the
 * lounge_post_images flag). A General question or a Win can carry a few
 * images: a screenshot of something odd in YAWP!, or a photo of student work.
 *
 * Teachers' phones put the location in a photo, so every image is stored
 * without its metadata: EXIF (GPS included), XMP, IPTC, comments and text
 * chunks are cut out of the bytes before they are saved. Orientation is the
 * one value kept, so a phone photo still stands the right way up. Pure, so
 * it can be tested byte for byte.
 */
import { sniffImageContentType } from '~/domain/document-images/document-images';
import type { LoungePostKindKey } from './topics';

export const LOUNGE_IMAGE_MAX_COUNT = 3;
export const LOUNGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LOUNGE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LoungeImageType = (typeof LOUNGE_IMAGE_TYPES)[number];

export function kindAllowsImages(kind: LoungePostKindKey): boolean {
  return kind === 'QUESTION' || kind === 'WIN';
}

export function isLoungeImageType(value: string): value is LoungeImageType {
  return (LOUNGE_IMAGE_TYPES as readonly string[]).includes(value);
}

/** A message for the teacher, or null when the images are fine. */
export function validateLoungeImages(files: Array<{ size: number; type: string }>): string | null {
  if (files.length > LOUNGE_IMAGE_MAX_COUNT) return `Add up to ${LOUNGE_IMAGE_MAX_COUNT} images.`;
  for (const file of files) {
    if (file.size === 0) return 'One of the images is empty.';
    if (!isLoungeImageType(file.type.split(';')[0]!.trim().toLowerCase())) return 'Use a PNG, JPEG, or WebP image.';
    if (file.size > LOUNGE_IMAGE_MAX_BYTES) return 'Each image has to be under 5 MB.';
  }
  return null;
}

export type PreparedLoungeImage = { contentType: LoungeImageType; bytes: Uint8Array; altText: string };

/**
 * Files from the composer, ready to save: checked for count, size and type,
 * typed by what the bytes really are (not what the browser said), and each
 * described for screen readers from the one description the teacher wrote.
 */
export function prepareLoungeImages(
  files: Array<{ type: string; size: number; bytes: Uint8Array }>,
  description: string
): { ok: true; images: PreparedLoungeImage[] } | { ok: false; error: string } {
  if (files.length === 0) return { ok: true, images: [] };
  const invalid = validateLoungeImages(files);
  if (invalid) return { ok: false, error: invalid };
  const altText = description.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!altText) return { ok: false, error: 'Describe the image in a few words, for teachers who use a screen reader.' };
  const images: PreparedLoungeImage[] = [];
  for (const [index, file] of files.entries()) {
    const sniffed = sniffImageContentType(file.bytes);
    if (!sniffed || !isLoungeImageType(sniffed)) return { ok: false, error: 'That file is not a PNG, JPEG, or WebP image.' };
    images.push({
      contentType: sniffed,
      bytes: file.bytes,
      altText: files.length > 1 ? `${altText} (image ${index + 1} of ${files.length})` : altText,
    });
  }
  return { ok: true, images };
}

export function stripImageMetadata(input: Uint8Array, type: LoungeImageType): Uint8Array {
  try {
    if (type === 'image/jpeg') return stripJpeg(input);
    if (type === 'image/png') return stripPng(input);
    return stripWebp(input);
  } catch {
    // Malformed past the signature: leave it as it is; the upload route only
    // stores bytes whose signature it has already checked.
    return input;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// --- JPEG -----------------------------------------------------------------

const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2; // ICC colour profile: no personal data, and colours depend on it.
const APP14 = 0xee; // Adobe colour transform: decoders depend on it.
const COM = 0xfe;
const SOS = 0xda;

function stripJpeg(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input;
  const parts: Uint8Array[] = [input.subarray(0, 2)];
  let orientation: number | null = null;
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) return input;
    const marker = input[offset + 1]!;
    if (marker === SOS) {
      if (orientation) parts.splice(1, 0, orientationSegment(orientation));
      parts.push(input.subarray(offset));
      return concat(parts);
    }
    const length = (input[offset + 2]! << 8) | input[offset + 3]!;
    if (length < 2 || offset + 2 + length > input.length) return input;
    const segment = input.subarray(offset, offset + 2 + length);
    const isApp = marker >= APP0 && marker <= 0xef;
    if (marker === APP1) orientation ??= exifOrientation(segment.subarray(4));
    const keep = (!isApp && marker !== COM) || marker === APP0 || marker === APP2 || marker === APP14;
    if (keep) parts.push(segment);
    offset += 2 + length;
  }
  return input;
}

/** Orientation (tag 0x0112) from an EXIF payload, or null. */
function exifOrientation(payload: Uint8Array): number | null {
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0, 0];
  if (payload.length < 14 || !exifHeader.every((byte, i) => payload[i] === byte)) return null;
  const tiff = new DataView(payload.buffer, payload.byteOffset + 6, payload.length - 6);
  const little = tiff.getUint16(0) === 0x4949;
  const ifd = tiff.getUint32(4, little);
  const count = tiff.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.byteLength) return null;
    if (tiff.getUint16(entry, little) === 0x0112) {
      const value = tiff.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A minimal APP1 holding only Orientation. */
function orientationSegment(orientation: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, // "MM", 42, IFD0 at 8
    0, 1, // one entry
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation, SHORT, 1
    0, 0, 0, 0, // no next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = payload.length + 2;
  return new Uint8Array([0xff, APP1, length >> 8, length & 0xff, ...payload]);
}

// --- PNG ------------------------------------------------------------------

const PNG_DROPPED = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(input: Uint8Array): Uint8Array {
  if (input.length < 8) return input;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const parts: Uint8Array[] = [input.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > input.length) return input;
    const type = String.fromCharCode(...input.subarray(offset + 4, offset + 8));
    if (!PNG_DROPPED.has(type)) parts.push(input.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

// --- WebP -----------------------------------------------------------------

function stripWebp(input: Uint8Array): Uint8Array {
  if (input.length < 12) return input;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= input.length) {
    const type = String.fromCharCode(...input.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > input.length) return input;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = input.slice(offset, end);
      // VP8X flags: clear "has EXIF" (0x08) and "has XMP" (0x04).
      if (type === 'VP8X' && chunk.length > 8) chunk[8] = chunk[8]! & ~0x0c;
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = concat([input.subarray(8, 12), ...chunks]);
  const header = new Uint8Array(8);
  header.set(input.subarray(0, 4));
  new DataView(header.buffer).setUint32(4, body.length, true);
  return concat([header, body]);
}
