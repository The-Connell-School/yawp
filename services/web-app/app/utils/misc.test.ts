import { describe, expect, mock, test } from 'bun:test';
import { getErrorMessage } from './misc';

describe('getErrorMessage', () => {
  test('logs scalar-safe metadata for unknown error shapes', () => {
    const errorSpy = mock(() => {});
    const originalError = console.error;
    console.error = errorSpy as typeof console.error;

    try {
      expect(getErrorMessage({ weird: 'token=secret teacher@school.edu' })).toBe(
        'Unknown Error',
      );
    } finally {
      console.error = originalError;
    }

    expect(errorSpy).toHaveBeenCalledWith(
      'unable_to_get_error_message',
      { errorName: 'UnknownError' },
    );
    expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain(
      'teacher@school.edu',
    );
    expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain('secret');
  });

  test('redacts token and email substrings from Error messages', () => {
    const message = getErrorMessage(
      new Error('Invite failed for teacher@school.edu token=SECRET-ABC'),
    );
    expect(message).toContain('Invite failed');
    expect(message).not.toContain('teacher@school.edu');
    expect(message).not.toContain('SECRET-ABC');
  });

  test('redacts sensitive substrings from string errors', () => {
    const message = getErrorMessage('password=abc123 dev.admin@yawp.local');
    expect(message).not.toContain('abc123');
    expect(message).not.toContain('dev.admin@yawp.local');
    expect(message).toContain('[redacted-token]');
  });

  test('redacts a message that is only sensitive text', () => {
    expect(getErrorMessage(new Error('token=only-secret'))).toBe(
      '[redacted-token]',
    );
  });
});
