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
});
