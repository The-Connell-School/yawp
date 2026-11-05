import { beforeEach, describe, expect, mock, test } from 'bun:test';

const capture = mock(() => Promise.resolve());

mock.module('~/services/posthog.server', () => ({
  posthog: { capture },
}));

const { captureAppErrorPresentedServer, captureAppRateLimitHitServer } =
  await import('./app-error-presented.server');

describe('app-error-presented server capture', () => {
  beforeEach(() => {
    capture.mockClear();
  });

  test('captures unexpected product errors', () => {
    captureAppErrorPresentedServer({
      distinctId: 'user-1',
      severity: 'user_blocking',
      surface: 'error_boundary',
      error_code: 'ROUTE_ERROR',
      http_status: 500,
      message_template: 'Something failed',
      route_template: '/app/assignments/abc',
      is_expected: false,
    });
    expect(capture).toHaveBeenCalledTimes(1);
    const calls = capture.mock.calls as unknown as Array<
      [{ event: string; distinctId: string; properties: Record<string, unknown> }]
    >;
    expect(calls[0]?.[0]).toMatchObject({
      event: 'app_error_presented',
      distinctId: 'user-1',
      properties: expect.objectContaining({
        error_code: 'ROUTE_ERROR',
        fingerprint: expect.stringMatching(/^fnv1a:/),
      }),
    });
  });

  test('skips suppressed auth login noise', () => {
    const result = captureAppErrorPresentedServer({
      distinctId: 'user-1',
      severity: 'info',
      surface: 'toast',
      error_code: 'TOAST_ERROR',
      http_status: null,
      message_template: 'Invalid email or password',
      route_template: '/auth/login',
      is_expected: true,
    });
    expect(result).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  test('captures operational rate-limit hits separately', () => {
    captureAppRateLimitHitServer({
      distinctId: 'user-1',
      feature: 'tutor',
      scope: 'user',
      limit_window: 'per_minute',
      route_template: '/api/domain/tutor-response',
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'app_rate_limit_hit',
        properties: expect.objectContaining({
          feature: 'tutor',
          scope: 'user',
          is_expected: true,
        }),
      })
    );
  });
});
