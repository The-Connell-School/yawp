import { afterEach, describe, expect, test } from 'bun:test';
import {
  buildSafeEmailLogSummary,
  canLogFullEmailBody,
} from './email-log.server';

const envKeys = [
  'NODE_ENV',
  'EMAIL_LOG_BODY',
  'YAWP_ENVIRONMENT',
  'DATABASE_URL',
  'RESEND_API_KEY',
] as const;
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      (process.env as Record<string, string | undefined>)[key] = value;
    }
  }
});

describe('buildSafeEmailLogSummary', () => {
  test('never includes body content or URLs', () => {
    const summary = buildSafeEmailLogSummary({
      from: 'noreply@yawp.school',
      to: 'teacher@school.edu',
      subject: 'Approve access',
      html: '<p>https://yawp.school/secret?t=abc123</p>',
      text: 'https://yawp.school/secret?t=abc123',
    }, { kind: 'approval' });

    expect(summary).toEqual({
      to: 't***@s***',
      kind: 'approval',
      bodyLength: 42,
    });
    expect(JSON.stringify(summary)).not.toContain('https:');
    expect(JSON.stringify(summary)).not.toContain('abc123');
  });
});

describe('canLogFullEmailBody', () => {
  test('requires development and explicit EMAIL_LOG_BODY opt-in', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.EMAIL_LOG_BODY = '1';
    expect(canLogFullEmailBody()).toBe(true);
  });

  test.each([
    ['production', { NODE_ENV: 'production', EMAIL_LOG_BODY: '1' }],
    ['preview yawp env', { NODE_ENV: 'development', EMAIL_LOG_BODY: '1', YAWP_ENVIRONMENT: 'preview' }],
    ['demo yawp env', { NODE_ENV: 'development', EMAIL_LOG_BODY: '1', YAWP_ENVIRONMENT: 'demo' }],
    ['production yawp env', { NODE_ENV: 'development', EMAIL_LOG_BODY: '1', YAWP_ENVIRONMENT: 'production' }],
    ['missing opt-in', { NODE_ENV: 'development' }],
    ['preview capture database', {
      NODE_ENV: 'development',
      EMAIL_LOG_BODY: '1',
      YAWP_ENVIRONMENT: 'preview',
      DATABASE_URL: 'postgresql://app@db/yawp_pr_416',
      RESEND_API_KEY: '',
    }],
  ] as const)('blocks full-body logging for %s', (_label, env) => {
    for (const key of envKeys) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
    expect(canLogFullEmailBody()).toBe(false);
  });
});
