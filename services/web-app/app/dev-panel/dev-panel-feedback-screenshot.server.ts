export const DEV_PANEL_SCREENSHOT_MAX_DECODED_BYTES = 450_000;

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // RIFF
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50]; // WEBP at offset 8

function bytesMatch(bytes: Uint8Array, pattern: number[], offset = 0) {
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|webp));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return { ok: false as const, reason: 'format' as const };
  const mime = match[1]!.toLowerCase();
  const base64 = match[2]!;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { ok: false as const, reason: 'decode' as const };
  }
  let bytes: Uint8Array;
  try {
    const binary = Buffer.from(base64, 'base64');
    bytes = new Uint8Array(binary);
  } catch {
    return { ok: false as const, reason: 'decode' as const };
  }
  if (bytes.length > DEV_PANEL_SCREENSHOT_MAX_DECODED_BYTES) {
    return { ok: false as const, reason: 'size' as const };
  }
  if (mime === 'image/jpeg') {
    if (!bytesMatch(bytes, JPEG_MAGIC)) {
      return { ok: false as const, reason: 'magic' as const };
    }
    return { ok: true as const, dataUrl, mime, bytes };
  }
  if (bytes.length < 12 || !bytesMatch(bytes, WEBP_RIFF) || !bytesMatch(bytes, WEBP_TAG, 8)) {
    return { ok: false as const, reason: 'magic' as const };
  }
  return { ok: true as const, dataUrl, mime, bytes };
}

export function parseDevPanelFeedbackScreenshot(value: string | null | undefined) {
  if (value == null || value === '') return { ok: true as const, screenshot: null as string | null };
  const parsed = decodeDataUrl(value);
  if (!parsed.ok) return parsed;
  return { ok: true as const, screenshot: parsed.dataUrl };
}
