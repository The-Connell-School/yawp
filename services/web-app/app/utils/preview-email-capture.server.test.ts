import { describe, expect, test } from 'bun:test';
import {
  isYawpPrPreviewDatabase,
  previewDatabaseNameFromUrl,
  shouldUsePreviewEmailCapture,
} from './preview-email-capture.server';

describe('preview email capture guards', () => {
  test('recognizes yawp_pr_N database names only', () => {
    expect(isYawpPrPreviewDatabase('yawp_pr_416')).toBe(true);
    expect(isYawpPrPreviewDatabase('yawp_pr_1')).toBe(true);
    expect(isYawpPrPreviewDatabase('yawp_demo')).toBe(false);
    expect(isYawpPrPreviewDatabase('yawp_pr_abc')).toBe(false);
  });

  test('parses database name from DATABASE_URL', () => {
    expect(
      previewDatabaseNameFromUrl(
        'postgresql://app:secret@preview-postgres:5432/yawp_pr_416?schema=public'
      )
    ).toBe('yawp_pr_416');
  });

  test('capture only on preview env + yawp_pr_N without real Resend key', () => {
    const prev = {
      YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
      DATABASE_URL: process.env.DATABASE_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
    };
    process.env.YAWP_ENVIRONMENT = 'preview';
    process.env.DATABASE_URL = 'postgresql://x/yawp_pr_416';
    process.env.RESEND_API_KEY = '';
    expect(shouldUsePreviewEmailCapture()).toBe(true);
    process.env.RESEND_API_KEY = 'preview-resend-key';
    expect(shouldUsePreviewEmailCapture()).toBe(true);
    process.env.RESEND_API_KEY = 're_real_key';
    expect(shouldUsePreviewEmailCapture()).toBe(false);
    process.env.DATABASE_URL = 'postgresql://x/yawp_demo';
    expect(shouldUsePreviewEmailCapture()).toBe(false);
    process.env.YAWP_ENVIRONMENT = 'production';
    expect(shouldUsePreviewEmailCapture()).toBe(false);
    process.env.YAWP_ENVIRONMENT = prev.YAWP_ENVIRONMENT;
    process.env.DATABASE_URL = prev.DATABASE_URL;
    process.env.RESEND_API_KEY = prev.RESEND_API_KEY;
  });
});
