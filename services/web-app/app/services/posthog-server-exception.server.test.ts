import { describe, expect, mock, test } from 'bun:test';
import type { PostHog } from 'posthog-node';

const captureException = mock();

const { capturePosthogServerException, errorForPosthogCapture } = await import(
  './posthog-server-exception.server'
);

describe('posthog server exception capture', () => {
  test('errorForPosthogCapture redacts sensitive message text', () => {
    const raw = new Error(
      'login failed for teacher@school.edu token=SECRET-TOKEN',
    );
    raw.stack =
      'Error: login failed\n    at handler (file:///app/auth:10:5)';

    const synthetic = errorForPosthogCapture(raw);
    expect(synthetic.message).toContain('login failed');
    expect(synthetic.message).not.toContain('teacher@school.edu');
    expect(synthetic.message).not.toContain('SECRET-TOKEN');
    expect(synthetic.stack ?? '').not.toContain('teacher@school.edu');
  });

  test('capturePosthogServerException forwards a sanitized Error', () => {
    const client = { captureException } as unknown as PostHog;
    captureException.mockReset();

    capturePosthogServerException(
      client,
      new Error('bad password for admin@school.edu'),
      'user-123',
      { route: '/auth/login' },
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, distinctId, props] = captureException.mock.calls[0] as [
      Error,
      string,
      Record<string, unknown>,
    ];
    expect(distinctId).toBe('user-123');
    expect(props).toEqual({ route: '/auth/login' });
    expect(error.message).not.toContain('admin@school.edu');
  });
});
