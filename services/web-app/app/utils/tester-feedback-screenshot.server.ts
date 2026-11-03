export const TESTER_FEEDBACK_SCREENSHOT_MAX_READ_BYTES = 2_000_000;

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

function contentTypeForBytes(bytes: Uint8Array): string | null {
  if (bytesMatch(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytesMatch(bytes, WEBP_RIFF) &&
    bytesMatch(bytes, WEBP_TAG, 8)
  ) {
    return 'image/webp';
  }
  return null;
}

export type DecodedFeedbackScreenshot =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; reason: 'invalid' | 'too_large' };

/** Decode a stored tester-feedback screenshot (data URL or raw base64). */
export function decodeStoredFeedbackScreenshot(
  stored: string
): DecodedFeedbackScreenshot {
  const trimmed = stored.trim();
  if (!trimmed) return { ok: false, reason: 'invalid' };
  const dataUrl = /^data:(image\/(?:jpeg|webp));base64,(.+)$/i.exec(trimmed);
  const finish = (bytes: Uint8Array, declaredMime?: string) => {
    if (bytes.length > TESTER_FEEDBACK_SCREENSHOT_MAX_READ_BYTES) {
      return { ok: false as const, reason: 'too_large' as const };
    }
    const contentType = contentTypeForBytes(bytes);
    if (!contentType) return { ok: false as const, reason: 'invalid' as const };
    if (declaredMime === 'image/jpeg' && contentType !== 'image/jpeg') {
      return { ok: false as const, reason: 'invalid' as const };
    }
    if (declaredMime === 'image/webp' && contentType !== 'image/webp') {
      return { ok: false as const, reason: 'invalid' as const };
    }
    return { ok: true as const, bytes, contentType };
  };
  if (dataUrl) {
    const bytes = decodeBase64Payload(dataUrl[2]!);
    if (!bytes?.length) return { ok: false, reason: 'invalid' };
    return finish(bytes, dataUrl[1]!.toLowerCase());
  }
  const bytes = decodeBase64Payload(trimmed);
  if (!bytes?.length) return { ok: false, reason: 'invalid' };
  return finish(bytes);
}
