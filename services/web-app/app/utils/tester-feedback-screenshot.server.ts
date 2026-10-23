const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50];

function bytesMatch(bytes: Uint8Array, pattern: number[], offset = 0) {
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function decodeBase64Payload(base64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  try {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } catch {
    return null;
  }
}

function contentTypeForBytes(bytes: Uint8Array, declared?: string) {
  if (bytesMatch(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytesMatch(bytes, WEBP_RIFF) &&
    bytesMatch(bytes, WEBP_TAG, 8)
  ) {
    return 'image/webp';
  }
  if (declared === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

/** Decode a stored tester-feedback screenshot (data URL or raw base64). */
export function decodeStoredFeedbackScreenshot(stored: string) {
  const trimmed = stored.trim();
  if (!trimmed) return null;
  const dataUrl = /^data:(image\/(?:jpeg|webp));base64,(.+)$/i.exec(trimmed);
  if (dataUrl) {
    const bytes = decodeBase64Payload(dataUrl[2]!);
    if (!bytes?.length) return null;
    const mime = dataUrl[1]!.toLowerCase();
    if (mime === 'image/jpeg' && !bytesMatch(bytes, JPEG_MAGIC)) return null;
    if (
      mime === 'image/webp' &&
      (bytes.length < 12 ||
        !bytesMatch(bytes, WEBP_RIFF) ||
        !bytesMatch(bytes, WEBP_TAG, 8))
    ) {
      return null;
    }
    return {
      bytes,
      contentType: contentTypeForBytes(bytes, mime),
    };
  }
  const bytes = decodeBase64Payload(trimmed);
  if (!bytes?.length) return null;
  return {
    bytes,
    contentType: contentTypeForBytes(bytes),
  };
}
