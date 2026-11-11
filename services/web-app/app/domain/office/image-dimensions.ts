/**
 * What kind of picture some bytes are, and how big, from the bytes alone.
 *
 * A deck's media part is named `image3.jpeg`, but the name is only a promise.
 * Pictures are served from our own origin, so the type is decided by the
 * file's signature, and only the raster formats every browser draws are
 * accepted. SVG is deliberately not among them: it is a document that can
 * carry script.
 */

export const PICTURE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type PictureContentType = (typeof PICTURE_CONTENT_TYPES)[number];

export function sniffPictureType(bytes: Uint8Array): PictureContentType | null {
  const startsWith = (...signature: number[]) =>
    signature.length <= bytes.length && signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes.length >= 12 &&
    [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[8 + index] === byte)
  ) {
    return 'image/webp';
  }
  return null;
}

export type Dimensions = { width: number; height: number };

function valid(width: number, height: number): Dimensions | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function jpegDimensions(bytes: Uint8Array, view: DataView): Dimensions | null {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    // Fill bytes and markers with no length.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = view.getUint16(at + 2);
    // Start-of-frame markers, every kind but DHT (C4), JPG (C8) and DAC (CC).
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (at + 9 > bytes.length) return null;
      return valid(view.getUint16(at + 7), view.getUint16(at + 5));
    }
    at += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array, view: DataView): Dimensions | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8 ') return valid(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true);
    return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X') {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return valid(width, height);
  }
  return null;
}

/** Pixel width and height, or null when the header is missing or unfamiliar. */
export function imageDimensions(bytes: Uint8Array): Dimensions | null {
  const type = sniffPictureType(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === 'image/png') return bytes.length >= 24 ? valid(view.getUint32(16), view.getUint32(20)) : null;
    if (type === 'image/gif') return bytes.length >= 10 ? valid(view.getUint16(6, true), view.getUint16(8, true)) : null;
    if (type === 'image/jpeg') return jpegDimensions(bytes, view);
    if (type === 'image/webp') return webpDimensions(bytes, view);
  } catch {
    return null;
  }
  return null;
}
