import { describe, expect, test } from 'bun:test';
import { buildSafeErrorScalarsForLog } from './error-log-scalars';

describe('buildSafeErrorScalarsForLog', () => {
  test('returns error name only for generic errors', () => {
    const error = new Error('secret token=ABC teacher@school.edu');
    expect(buildSafeErrorScalarsForLog(error)).toEqual({ errorName: 'Error' });
    expect(JSON.stringify(buildSafeErrorScalarsForLog(error))).not.toContain(
      'teacher@school.edu',
    );
  });

  test('includes allow-listed error codes when present', () => {
    const error = Object.assign(new Error('connection failed'), {
      code: 'ECONNREFUSED',
    });
    expect(buildSafeErrorScalarsForLog(error)).toEqual({
      errorName: 'Error',
      code: 'ECONNREFUSED',
    });
  });

  test('drops non-scalar or message-like codes', () => {
    const error = Object.assign(new Error('boom'), {
      code: 'token=secret',
    });
    expect(buildSafeErrorScalarsForLog(error)).toEqual({ errorName: 'Error' });
  });

  test('handles non-Error values', () => {
    expect(buildSafeErrorScalarsForLog('failed')).toEqual({
      errorName: 'UnknownError',
    });
  });
});
