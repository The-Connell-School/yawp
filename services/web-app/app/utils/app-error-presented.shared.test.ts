import { describe, expect, test } from 'bun:test';
import {
  buildAppErrorFingerprint,
  buildAppErrorPresentedPayload,
  classifyTutorApiError,
  inferToastErrorPresentation,
  sanitizeMessageTemplate,
  shouldSuppressAppErrorPresented,
  templateRoutePath,
  TUTOR_RATE_LIMIT_MESSAGE,
} from './app-error-presented.shared';

describe('templateRoutePath', () => {
  test('replaces UUIDs, cuids, and numeric segments', () => {
    expect(
      templateRoutePath(
        '/app/documents/clxyz1234567890123456789012/submissions/42/edit'
      )
    ).toBe('/app/documents/:id/submissions/:id/edit');
    expect(
      templateRoutePath(
        '/app/documents/550e8400-e29b-41d4-a716-446655440000'
      )
    ).toBe('/app/documents/:id');
  });
});

describe('sanitizeMessageTemplate', () => {
  test('redacts emails and truncates long copy', () => {
    const sanitized = sanitizeMessageTemplate(
      `Failed for student@test.com ${'x'.repeat(200)}`
    );
    expect(sanitized).toContain('[email]');
    expect(sanitized.length).toBeLessThanOrEqual(160);
    expect(sanitized).not.toContain('student@test.com');
  });
});

describe('buildAppErrorFingerprint', () => {
  test('is stable for the same inputs', () => {
    const input = {
      error_code: 'HTTP_500',
      route_template: '/app/documents/:id',
      message_template: 'Something failed',
    };
    expect(buildAppErrorFingerprint(input)).toBe(
      buildAppErrorFingerprint(input)
    );
  });
});

describe('shouldSuppressAppErrorPresented', () => {
  test('suppresses auth invitation toasts and login validation noise', () => {
    expect(
      shouldSuppressAppErrorPresented({
        route_template: '/auth/login',
        surface: 'toast',
        error_code: 'TOAST_ERROR',
        message_template: 'Invalid email or password',
        toast_title: 'Sign in failed',
      })
    ).toBe(true);
    expect(
      shouldSuppressAppErrorPresented({
        route_template: '/auth/login',
        surface: 'toast',
        error_code: 'TOAST_ERROR',
        message_template: 'Please contact your administrator.',
        toast_title: 'Invalid invitation',
      })
    ).toBe(true);
  });

  test('does not suppress unexpected app errors', () => {
    expect(
      shouldSuppressAppErrorPresented({
        route_template: '/app/assignments/:id',
        surface: 'toast',
        error_code: 'TOAST_ERROR',
        message_template: 'Could not save assignment',
        toast_title: 'Save failed',
      })
    ).toBe(false);
  });
});

describe('inferToastErrorPresentation', () => {
  test('marks suppressed auth toasts as expected', () => {
    const result = inferToastErrorPresentation({
      route_template: '/auth/login',
      title: 'Invalid invitation',
      description: 'Class not found.',
    });
    expect(result.is_expected).toBe(true);
  });
});

describe('classifyTutorApiError', () => {
  test('classifies tutor rate limits as expected operational noise', () => {
    const result = classifyTutorApiError({
      status: 429,
      error: {
        code: 'RATE_LIMITED',
        scope: 'user',
        message: TUTOR_RATE_LIMIT_MESSAGE,
        retryAfterSeconds: 45,
      },
    });
    expect(result).toMatchObject({
      error_code: 'RATE_LIMITED',
      is_expected: true,
      severity: 'info',
      rate_limit: {
        feature: 'tutor',
        scope: 'user',
        limit_window: 'per_minute',
      },
    });
  });

  test('treats server failures as user-blocking defects', () => {
    const result = classifyTutorApiError({
      status: 500,
      message: 'Failed to get a response from the tutor. Please try again.',
    });
    expect(result).toMatchObject({
      error_code: 'TUTOR_FAILED',
      severity: 'user_blocking',
      is_expected: false,
    });
  });
});

describe('buildAppErrorPresentedPayload', () => {
  test('includes fingerprint and product area', () => {
    const payload = buildAppErrorPresentedPayload({
      severity: 'degraded',
      surface: 'banner',
      error_code: 'RATE_LIMITED',
      http_status: 429,
      message_template: TUTOR_RATE_LIMIT_MESSAGE,
      route_template: '/app/documents/42',
      environment: 'test',
      is_expected: true,
    });
    expect(payload.product_area).toBe('documents');
    const tutorPayload = buildAppErrorPresentedPayload({
      severity: 'info',
      surface: 'banner',
      error_code: 'RATE_LIMITED',
      http_status: 429,
      message_template: TUTOR_RATE_LIMIT_MESSAGE,
      route_template: '/app/documents/42',
      environment: 'test',
      is_expected: true,
      product_area: 'tutor',
    });
    expect(tutorPayload.product_area).toBe('tutor');
    expect(payload.fingerprint).toMatch(/^fnv1a:/);
    expect(payload.route_template).toBe('/app/documents/:id');
  });
});
