import { describe, expect, test } from 'bun:test';
import {
  decodeStoredFeedbackScreenshot,
  TESTER_FEEDBACK_SCREENSHOT_MAX_READ_BYTES,
} from './tester-feedback-screenshot.server';

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x10]);
const jpegBase64 = Buffer.from(jpegBytes).toString('base64');

describe('decodeStoredFeedbackScreenshot', () => {
  test('decodes jpeg data URLs and raw base64', () => {
    for (const stored of [
      `data:image/jpeg;base64,${jpegBase64}`,
      jpegBase64,
    ]) {
      const decoded = decodeStoredFeedbackScreenshot(stored);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(decoded.contentType).toBe('image/jpeg');
      expect(decoded.bytes).toEqual(jpegBytes);
    }
  });

  test('rejects empty, invalid, mismatched and non-image raw payloads', () => {
    expect(decodeStoredFeedbackScreenshot('').ok).toBe(false);
    expect(decodeStoredFeedbackScreenshot('not-base64!!!').ok).toBe(false);
    expect(
      decodeStoredFeedbackScreenshot(
        `data:image/jpeg;base64,${Buffer.from('bad').toString('base64')}`
      ).ok
    ).toBe(false);
    expect(decodeStoredFeedbackScreenshot(Buffer.from('bad').toString('base64')).ok).toBe(
      false
    );
  });

  test('rejects decoded payloads above the read-time size cap', () => {
    const oversized = Buffer.alloc(TESTER_FEEDBACK_SCREENSHOT_MAX_READ_BYTES + 1, 0xff);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;
    const decoded = decodeStoredFeedbackScreenshot(oversized.toString('base64'));
    expect(decoded).toEqual({ ok: false, reason: 'too_large' });
  });
});
