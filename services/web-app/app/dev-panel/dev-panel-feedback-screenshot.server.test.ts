import { describe, expect, test } from 'bun:test';
import { parseDevPanelFeedbackScreenshot } from './dev-panel-feedback-screenshot.server';

const tinyJpeg =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGCAjJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnL/2wBDAQ4ODhANDg4dERUQEBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAz8Cf//Z';

describe('parseDevPanelFeedbackScreenshot', () => {
  test('accepts a valid JPEG data URL', () => {
    const result = parseDevPanelFeedbackScreenshot(`data:image/jpeg;base64,${tinyJpeg}`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.screenshot).toContain('data:image/jpeg');
  });

  test('rejects non-image data URLs', () => {
    const result = parseDevPanelFeedbackScreenshot('data:text/plain;base64,Ym9v');
    expect(result.ok).toBe(false);
  });

  test('rejects invalid base64 characters', () => {
    const result = parseDevPanelFeedbackScreenshot(
      'data:image/jpeg;base64,not-valid-base64!!!'
    );
    expect(result.ok).toBe(false);
  });
});
