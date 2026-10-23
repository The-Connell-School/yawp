import { describe, expect, test } from 'bun:test';
import { decodeStoredFeedbackScreenshot } from './tester-feedback-screenshot.server';

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00, 0x10]);
const jpegBase64 = Buffer.from(jpegBytes).toString('base64');

describe('decodeStoredFeedbackScreenshot', () => {
  test('decodes jpeg data URLs and raw base64', () => {
    for (const stored of [
      `data:image/jpeg;base64,${jpegBase64}`,
      jpegBase64,
    ]) {
      const decoded = decodeStoredFeedbackScreenshot(stored);
      expect(decoded?.contentType).toBe('image/jpeg');
      expect(decoded?.bytes).toEqual(jpegBytes);
    }
  });

  test('rejects empty, invalid and mismatched payloads', () => {
    expect(decodeStoredFeedbackScreenshot('')).toBeNull();
    expect(decodeStoredFeedbackScreenshot('not-base64!!!')).toBeNull();
    expect(
      decodeStoredFeedbackScreenshot(`data:image/jpeg;base64,${Buffer.from('bad').toString('base64')}`)
    ).toBeNull();
  });
});
