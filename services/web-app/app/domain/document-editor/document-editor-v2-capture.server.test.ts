import { describe, expect, test } from 'bun:test';
import { parseDocumentEditorV2Capture } from './document-editor-v2-capture.shared';
import { isDocumentEditorV2CaptureAllowed } from './document-editor-v2-capture.server';

describe('document-editor-v2-capture', () => {
  test('parseDocumentEditorV2Capture accepts known states only', () => {
    expect(parseDocumentEditorV2Capture('saving')).toBe('saving');
    expect(parseDocumentEditorV2Capture('submitted')).toBe('submitted');
    expect(parseDocumentEditorV2Capture('comments-reply-resolved')).toBe(
      'comments-reply-resolved'
    );
    expect(parseDocumentEditorV2Capture('nope')).toBeNull();
    expect(parseDocumentEditorV2Capture('')).toBeNull();
  });

  test('isDocumentEditorV2CaptureAllowed is preview yawp_pr only', () => {
    const previewEnv = {
      ...process.env,
      YAWP_ENVIRONMENT: 'preview',
      DATABASE_URL: 'postgresql://x/yawp_pr_963',
    } as NodeJS.ProcessEnv;
  expect(isDocumentEditorV2CaptureAllowed(previewEnv)).toBe(true);
    const prodEnv = {
      ...process.env,
      YAWP_ENVIRONMENT: 'production',
      DATABASE_URL: 'postgresql://x/yawp_pr_963',
    } as NodeJS.ProcessEnv;
    expect(isDocumentEditorV2CaptureAllowed(prodEnv)).toBe(false);
    const localEnv = {
      ...process.env,
      YAWP_ENVIRONMENT: 'preview',
      DATABASE_URL: 'postgresql://x/yawp_local_dev',
    } as NodeJS.ProcessEnv;
    expect(isDocumentEditorV2CaptureAllowed(localEnv)).toBe(false);
  });
});