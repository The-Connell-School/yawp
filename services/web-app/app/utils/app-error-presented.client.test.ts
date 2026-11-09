import { beforeEach, describe, expect, mock, test } from 'bun:test';

const capture = mock(() => {});

mock.module('posthog-js', () => ({
  default: { capture },
}));

const { captureAppErrorPresentedClient } = await import(
  './app-error-presented.client'
);

describe('app-error-presented client capture', () => {
  beforeEach(() => {
    capture.mockClear();
  });

  test('suppresses title-only expected auth noise when description is generic', () => {
    const result = captureAppErrorPresentedClient({
      severity: 'info',
      surface: 'toast',
      error_code: 'TOAST_ERROR',
      http_status: null,
      message_template: 'Please contact your administrator.',
      route_template: '/auth/login',
      is_expected: true,
      toast_title: 'Invalid invitation',
    });
    expect(result).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  test('still captures unexpected toast errors', () => {
    const result = captureAppErrorPresentedClient({
      severity: 'degraded',
      surface: 'toast',
      error_code: 'TOAST_ERROR',
      http_status: null,
      message_template: 'Could not save assignment',
      route_template: '/app/assignments/abc',
      is_expected: false,
      toast_title: 'Save failed',
    });
    expect(result).not.toBeNull();
    expect(capture).toHaveBeenCalledTimes(1);
    const calls = capture.mock.calls as unknown as Array<
      [string, Record<string, unknown>]
    >;
    expect(calls[0]?.[0]).toBe('app_error_presented');
    expect(calls[0]?.[1]).toMatchObject({
      error_code: 'TOAST_ERROR',
      is_expected: false,
    });
  });

  test('redacts sensitive data in captured message_template only', () => {
    captureAppErrorPresentedClient({
      severity: 'degraded',
      surface: 'toast',
      error_code: 'TOAST_ERROR',
      http_status: null,
      message_template: 'Failed for [email]',
      route_template: '/app/home',
      is_expected: false,
      toast_title: 'Leak probe student@test.com',
    });
    expect(capture).toHaveBeenCalledTimes(1);
    const properties = (
      capture.mock.calls as unknown as Array<[string, Record<string, unknown>]>
    )[0]?.[1];
    expect(properties?.message_template).toBe('Failed for [email]');
    expect(JSON.stringify(properties)).not.toContain('student@test.com');
  });
});
